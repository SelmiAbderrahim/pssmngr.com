// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it } from "vitest";
import {
	invitation as invitationTable,
	member as memberTable,
	organization as organizationTable,
} from "../../db/schema";
import {
	AlreadyMemberError,
	createOwnedOrganizationGuarded,
	InvitationAlreadyExistsError,
	MemberLimitError,
	OrganizationLimitError,
	reserveInvitationGuarded,
} from "../org-membership";

interface OrganizationRow {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	metadata: string | null;
	ownerId: string;
	createdAt: Date;
}

interface MemberRow {
	id: string;
	organizationId: string;
	userId: string;
	role: "owner" | "admin" | "member";
	createdAt: Date;
	isDefault: boolean;
}

interface InvitationRow {
	id: string;
	organizationId: string;
	email: string;
	role: "admin" | "member";
	status: string;
	expiresAt: Date;
	inviterId: string;
}

interface State {
	organizations: OrganizationRow[];
	members: MemberRow[];
	invitations: InvitationRow[];
	events: string[];
	nextId: number;
}

function createMutex() {
	let chain = Promise.resolve();
	return {
		acquire(): Promise<() => void> {
			let release!: () => void;
			const next = new Promise<void>((resolve) => {
				release = resolve;
			});
			const acquired = chain.then(() => release);
			chain = chain.then(() => next);
			return acquired;
		},
	};
}

function extractParams(condition: unknown): unknown[] {
	const values: unknown[] = [];
	const walk = (node: unknown) => {
		if (!node || typeof node !== "object") return;
		const record = node as Record<string, unknown>;
		if ("value" in record && typeof record.value !== "object") {
			values.push(record.value);
		}
		for (const key of ["queryChunks", "left", "right"]) {
			const child = record[key];
			if (Array.isArray(child)) child.forEach(walk);
			else walk(child);
		}
	};
	walk(condition);
	return values;
}

function createMockDb(state: State) {
	const mutex = createMutex();

	return {
		transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
			let release: (() => void) | undefined;
			const organizations: OrganizationRow[] = [];
			const members: MemberRow[] = [];
			const invitations: InvitationRow[] = [];

			const tx = {
				execute: async () => {
					state.events.push("lock-requested");
					release = await mutex.acquire();
					state.events.push("lock-acquired");
					return [];
				},
				query: {
					member: {
						findFirst: async ({ where }: { where: unknown }) => {
							const params = extractParams(where);
							return [...state.members, ...members].find(
								(row) =>
									params.includes(row.userId) &&
									(!params.some(
										(value) =>
											typeof value === "string" && value.startsWith("org-"),
									) ||
										params.includes(row.organizationId)),
							);
						},
					},
					invitation: {
						findFirst: async ({ where }: { where: unknown }) => {
							const params = extractParams(where);
							return [...state.invitations, ...invitations].find(
								(row) =>
									params.includes(row.organizationId) &&
									params.includes(row.email) &&
									params.includes(row.status) &&
									row.expiresAt > new Date(),
							);
						},
					},
				},
				select: () => ({
					from: (table: unknown) => {
						const countRows = async (where: unknown) => {
							const params = extractParams(where);
							if (table === invitationTable) {
								return [
									{
										value: state.invitations.filter(
											(row) =>
												params.includes(row.organizationId) &&
												params.includes(row.status) &&
												row.expiresAt > new Date(),
										).length,
									},
								];
							}
							return [
								{
									value: state.members.filter((row) =>
										params.includes(row.organizationId),
									).length,
								},
							];
						};
						return {
							where: countRows,
							innerJoin: () => ({
								where: async (where: unknown) => {
									const params = extractParams(where);
									return [
										{
											value: state.members.filter((row) => {
												const org = state.organizations.find(
													(candidate) => candidate.id === row.organizationId,
												);
												return (
													params.includes(row.userId) &&
													params.includes(row.role) &&
													org?.metadata === null
												);
											}).length,
										},
									];
								},
							}),
						};
					},
				}),
				insert: (table: unknown) => ({
					values: (value: Record<string, unknown>) => {
						if (table === organizationTable) {
							const row: OrganizationRow = {
								id: `org-${++state.nextId}`,
								name: String(value.name),
								slug: String(value.slug),
								logo: (value.logo as string | null) ?? null,
								metadata: null,
								ownerId: String(value.ownerId),
								createdAt: value.createdAt as Date,
							};
							organizations.push(row);
							return { returning: async () => [row] };
						}
						if (table === memberTable) {
							members.push({
								id: `member-${++state.nextId}`,
								organizationId: String(value.organizationId),
								userId: String(value.userId),
								role: value.role as MemberRow["role"],
								createdAt: value.createdAt as Date,
								isDefault: Boolean(value.isDefault),
							});
							return { returning: async () => members.slice(-1) };
						}
						const row = value as unknown as InvitationRow;
						invitations.push(row);
						return { returning: async () => [row] };
					},
				}),
			};

			try {
				const result = await callback(tx);
				state.organizations.push(...organizations);
				state.members.push(...members);
				state.invitations.push(...invitations);
				return result;
			} finally {
				release?.();
			}
		},
	} as unknown as Parameters<typeof createOwnedOrganizationGuarded>[0];
}

function initialState(): State {
	return {
		organizations: [
			{
				id: "org-existing",
				name: "Existing",
				slug: "existing",
				logo: null,
				metadata: null,
				ownerId: "owner-1",
				createdAt: new Date(),
			},
		],
		members: [
			{
				id: "member-existing",
				organizationId: "org-existing",
				userId: "owner-1",
				role: "owner",
				createdAt: new Date(),
				isDefault: true,
			},
		],
		invitations: [],
		events: [],
		nextId: 0,
	};
}

describe("organization capacity mutation guards", () => {
	it("creates the first organization as default and preserves its logo", async () => {
		const state = initialState();
		state.organizations = [];
		state.members = [];
		const db = createMockDb(state);

		const created = await createOwnedOrganizationGuarded(db, {
			userId: "owner-1",
			name: "First",
			slug: "first",
			logo: "logo.svg",
			resolveLimit: async () => 1,
		});

		expect(created.logo).toBe("logo.svg");
		expect(state.members[0]?.isDefault).toBe(true);
	});

	it("serializes concurrent creation at the final account slot", async () => {
		const state = initialState();
		const db = createMockDb(state);
		const create = (name: string) =>
			createOwnedOrganizationGuarded(db, {
				userId: "owner-1",
				name,
				slug: name.toLowerCase(),
				resolveLimit: async () => 2,
			});

		const results = await Promise.allSettled([create("A"), create("B")]);

		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		const failure = results.find(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		expect(failure?.reason).toBeInstanceOf(OrganizationLimitError);
		expect(state.organizations).toHaveLength(2);
	});

	it("serializes concurrent invitations at the final member slot", async () => {
		const state = initialState();
		const db = createMockDb(state);
		const reserve = (id: string, email: string) =>
			reserveInvitationGuarded(db, {
				id,
				organizationId: "org-existing",
				email,
				role: "member",
				inviterId: "owner-1",
				expiresAt: new Date(Date.now() + 60_000),
				resolveMemberLimit: async () => 2,
			});

		const results = await Promise.allSettled([
			reserve("invite-a", "a@example.com"),
			reserve("invite-b", "b@example.com"),
		]);

		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		const failure = results.find(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		expect(failure?.reason).toBeInstanceOf(MemberLimitError);
		expect(state.invitations).toHaveLength(1);
	});

	it("rejects a duplicate pending invitation before consuming capacity", async () => {
		const state = initialState();
		state.invitations.push({
			id: "existing-invite",
			organizationId: "org-existing",
			email: "same@example.com",
			role: "member",
			status: "pending",
			expiresAt: new Date(Date.now() + 60_000),
			inviterId: "owner-1",
		});
		const db = createMockDb(state);

		await expect(
			reserveInvitationGuarded(db, {
				id: "new-invite",
				organizationId: "org-existing",
				email: "same@example.com",
				role: "member",
				inviterId: "owner-1",
				expiresAt: new Date(Date.now() + 60_000),
				resolveMemberLimit: async () => 99,
			}),
		).rejects.toThrow(InvitationAlreadyExistsError);
		expect(state.invitations).toHaveLength(1);
	});

	it("rejects an invitation for an existing organization member", async () => {
		const state = initialState();
		const db = createMockDb(state);

		await expect(
			reserveInvitationGuarded(db, {
				id: "new-invite",
				organizationId: "org-existing",
				email: "owner@example.com",
				role: "member",
				inviterId: "owner-1",
				userId: "owner-1",
				expiresAt: new Date(Date.now() + 60_000),
				resolveMemberLimit: async () => 99,
			}),
		).rejects.toThrow(AlreadyMemberError);
		expect(state.invitations).toHaveLength(0);
	});

	it("ignores expired pending invitations for duplicate and capacity checks", async () => {
		const state = initialState();
		state.invitations.push({
			id: "expired-invite",
			organizationId: "org-existing",
			email: "same@example.com",
			role: "member",
			status: "pending",
			expiresAt: new Date(Date.now() - 60_000),
			inviterId: "owner-1",
		});
		const db = createMockDb(state);

		await reserveInvitationGuarded(db, {
			id: "replacement-invite",
			organizationId: "org-existing",
			email: "same@example.com",
			role: "member",
			inviterId: "owner-1",
			expiresAt: new Date(Date.now() + 60_000),
			resolveMemberLimit: async () => 2,
		});

		expect(state.invitations.map((row) => row.id)).toContain(
			"replacement-invite",
		);
	});
});
