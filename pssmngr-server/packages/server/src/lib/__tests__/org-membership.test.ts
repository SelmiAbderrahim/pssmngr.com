// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Tests for the organization membership guard.
 *
 * Security regression tests for the invitation-acceptance race: the
 * member-limit check and insert must be serialized per organization via
 * a Postgres advisory transaction lock, so concurrent acceptances can
 * never exceed the plan's member limit or insert duplicate member rows.
 */
import { describe, expect, it } from "vitest";
import {
	AlreadyMemberError,
	acceptMembershipGuarded,
	InvitationNotAcceptableError,
	MemberLimitError,
	orgAdvisoryLockKey,
} from "../org-membership";

// ---------------------------------------------------------------------------
// Mock database
//
// Simulates the parts of Postgres that matter for the race:
//  - an advisory lock implemented as a per-key async mutex, acquired by
//    `tx.execute(pg_advisory_xact_lock...)` and released when the
//    transaction callback settles (commit OR rollback) — matching
//    pg_advisory_xact_lock semantics
//  - a shared member store read by the count/findFirst queries and
//    written by the insert, with rollback discarding the write
// ---------------------------------------------------------------------------

interface MemberRow {
	organizationId: string;
	userId: string;
	role: string;
}

interface InvitationRow {
	id: string;
	organizationId: string;
	email: string;
	role: "owner" | "member" | "admin" | null;
	status: string;
	expiresAt: Date;
}

interface MockDbState {
	members: MemberRow[];
	invitations: InvitationRow[];
	invitationStatuses: Map<string, string>;
	/** Order of lock/insert events, for serialization assertions. */
	events: string[];
}

function createMutex() {
	let chain = Promise.resolve();
	return {
		acquire(): Promise<() => void> {
			let release!: () => void;
			const next = new Promise<void>((res) => {
				release = res;
			});
			const acquired = chain.then(() => release);
			chain = chain.then(() => next);
			return acquired;
		},
	};
}

function createMockDb(
	state: MockDbState,
	opts?: { simulateLock?: boolean; failTransition?: boolean },
) {
	const simulateLock = opts?.simulateLock ?? true;
	const locks = new Map<string, ReturnType<typeof createMutex>>();

	function mutexFor(key: string) {
		let m = locks.get(key);
		if (!m) {
			m = createMutex();
			locks.set(key, m);
		}
		return m;
	}

	return {
		transaction: async (cb: (tx: unknown) => Promise<void>) => {
			let release: (() => void) | null = null;
			// Transaction-local writes, committed only on success.
			const pendingMembers: MemberRow[] = [];
			const pendingInvitations: Array<[string, string]> = [];

			const tx = {
				execute: async (query: { queryChunks?: unknown }) => {
					const text = JSON.stringify(query);
					if (text.includes("pg_advisory_xact_lock")) {
						state.events.push("lock-requested");
						if (simulateLock) {
							release = await mutexFor("org-lock").acquire();
						}
						state.events.push("lock-acquired");
					}
					return [];
				},
				query: {
					invitation: {
						findFirst: async (args: {
							where: unknown;
						}): Promise<InvitationRow | undefined> => {
							const params = extractParams(args.where);
							return state.invitations.find((row) => params.includes(row.id));
						},
					},
					member: {
						findFirst: async (args: {
							where: unknown;
						}): Promise<MemberRow | undefined> => {
							// The guard always filters on (userId, organizationId);
							// extract both from the drizzle condition params.
							const params = extractParams(args.where);
							return state.members.find(
								(m) =>
									params.includes(m.userId) &&
									params.includes(m.organizationId),
							);
						},
					},
				},
				select: () => ({
					from: () => ({
						where: async (cond: unknown) => {
							const params = extractParams(cond);
							const value = state.members.filter((m) =>
								params.includes(m.organizationId),
							).length;
							return [{ value }];
						},
					}),
				}),
				insert: () => ({
					values: async (v: MemberRow) => {
						state.events.push(`insert:${v.userId}`);
						pendingMembers.push(v);
					},
				}),
				update: () => ({
					set: (v: { status: string }) => ({
						where: (cond: unknown) => ({
							returning: async () => {
								const params = extractParams(cond);
								const row = state.invitations.find(
									(candidate) =>
										params.includes(candidate.id) &&
										params.includes(candidate.organizationId) &&
										params.includes(candidate.email) &&
										candidate.status === "pending" &&
										candidate.expiresAt > new Date(),
								);
								if (!row || opts?.failTransition) return [];
								state.events.push(`transition:${row.id}`);
								pendingInvitations.push([row.id, v.status]);
								return [{ id: row.id }];
							},
						}),
					}),
				}),
			};

			try {
				await cb(tx);
				// Commit
				state.members.push(...pendingMembers);
				for (const [id, status] of pendingInvitations) {
					state.invitationStatuses.set(id, status);
					const row = state.invitations.find((inv) => inv.id === id);
					if (row) row.status = status;
				}
			} finally {
				// pg_advisory_xact_lock releases on commit AND rollback
				if (release) (release as () => void)();
			}
		},
	} as unknown as Parameters<typeof acceptMembershipGuarded>[0];
}

/** Pull bound parameter values out of a drizzle SQL condition tree. */
function extractParams(cond: unknown): unknown[] {
	const out: unknown[] = [];
	const walk = (node: unknown) => {
		if (!node || typeof node !== "object") return;
		const rec = node as Record<string, unknown>;
		if ("value" in rec && typeof rec.value !== "object") {
			out.push(rec.value);
		}
		for (const key of ["queryChunks", "left", "right"]) {
			const child = rec[key];
			if (Array.isArray(child)) child.forEach(walk);
			else if (child) walk(child);
		}
	};
	walk(cond);
	return out;
}

function freshState(members: MemberRow[] = []): MockDbState {
	const invitationFor = (id: string): InvitationRow => ({
		id,
		organizationId: "org-1",
		email: "user-2@example.com",
		role: "member",
		status: "pending",
		expiresAt: new Date(Date.now() + 60_000),
	});
	return {
		members,
		invitations: [
			invitationFor("inv-1"),
			invitationFor("inv-A"),
			invitationFor("inv-B"),
		],
		invitationStatuses: new Map(),
		events: [],
	};
}

// ---------------------------------------------------------------------------
// orgAdvisoryLockKey
// ---------------------------------------------------------------------------

describe("orgAdvisoryLockKey", () => {
	it("is deterministic for the same organization id", () => {
		expect(orgAdvisoryLockKey("org-123")).toBe(orgAdvisoryLockKey("org-123"));
	});

	it("differs across organizations", () => {
		expect(orgAdvisoryLockKey("org-123")).not.toBe(
			orgAdvisoryLockKey("org-456"),
		);
	});

	it("fits in Postgres' signed bigint range", () => {
		for (const id of ["a", "org-123", "x".repeat(200)]) {
			const key = orgAdvisoryLockKey(id);
			expect(key >= 0n).toBe(true);
			expect(key <= 0x7fffffffffffffffn).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// acceptMembershipGuarded — sequential behavior
// ---------------------------------------------------------------------------

describe("acceptMembershipGuarded", () => {
	const baseParams = {
		organizationId: "org-1",
		userId: "user-2",
		email: "user-2@example.com",
		invitationId: "inv-1",
		resolveMemberLimit: async () => 2,
	};

	it("inserts the member and accepts the invitation under the limit", async () => {
		const state = freshState([
			{ organizationId: "org-1", userId: "owner", role: "owner" },
		]);
		const db = createMockDb(state);

		await acceptMembershipGuarded(db, baseParams);

		expect(state.members).toHaveLength(2);
		expect(state.members[1]).toMatchObject({
			organizationId: "org-1",
			userId: "user-2",
			role: "member",
		});
		expect(state.invitationStatuses.get("inv-1")).toBe("accepted");
	});

	it("acquires the advisory lock before checking or inserting", async () => {
		const state = freshState([]);
		const db = createMockDb(state);

		await acceptMembershipGuarded(db, baseParams);

		expect(state.events[0]).toBe("lock-requested");
		expect(state.events[1]).toBe("lock-acquired");
		expect(state.events.indexOf("lock-acquired")).toBeLessThan(
			state.events.indexOf("insert:user-2"),
		);
		expect(state.events.indexOf("transition:inv-1")).toBeLessThan(
			state.events.indexOf("insert:user-2"),
		);
	});

	it("derives the member role from the invitation read under the lock", async () => {
		const state = freshState([]);
		state.invitations[0]!.role = "admin";
		const db = createMockDb(state);

		await acceptMembershipGuarded(db, baseParams);

		expect(state.members[0]?.role).toBe("admin");
	});

	it("defaults a legacy invitation without a role to member", async () => {
		const state = freshState([]);
		state.invitations[0]!.role = null;
		const db = createMockDb(state);

		await acceptMembershipGuarded(db, baseParams);

		expect(state.members[0]?.role).toBe("member");
	});

	it("does not allow a legacy invitation to grant organization ownership", async () => {
		const state = freshState([]);
		state.invitations[0]!.role = "owner";
		const db = createMockDb(state);

		await acceptMembershipGuarded(db, baseParams);

		expect(state.members[0]?.role).toBe("member");
	});

	it("does not insert when the conditional invitation transition loses a race", async () => {
		const state = freshState([]);
		const db = createMockDb(state, { failTransition: true });

		await expect(
			acceptMembershipGuarded(db, baseParams),
		).rejects.toMatchObject<InvitationNotAcceptableError>({
			reason: "expired",
		});
		expect(state.members).toHaveLength(0);
	});

	it.each([
		["missing", "not_found"],
		["wrong organization", "organization_mismatch"],
		["wrong email", "email_mismatch"],
		["expired", "expired"],
		["not pending", "expired"],
	] as const)(
		"rejects an invitation that is %s after locking",
		async (_label, reason) => {
			const state = freshState([]);
			if (reason === "not_found") state.invitations = [];
			if (reason === "organization_mismatch") {
				state.invitations[0]!.organizationId = "org-other";
			}
			if (reason === "email_mismatch") {
				state.invitations[0]!.email = "other@example.com";
			}
			if (_label === "expired") {
				state.invitations[0]!.expiresAt = new Date(Date.now() - 1);
			}
			if (_label === "not pending") state.invitations[0]!.status = "cancelled";
			const db = createMockDb(state);

			await expect(
				acceptMembershipGuarded(db, baseParams),
			).rejects.toMatchObject<InvitationNotAcceptableError>({ reason });
			expect(state.members).toHaveLength(0);
		},
	);

	it("throws AlreadyMemberError for an existing member and writes nothing", async () => {
		const state = freshState([
			{ organizationId: "org-1", userId: "user-2", role: "member" },
		]);
		const db = createMockDb(state);

		await expect(acceptMembershipGuarded(db, baseParams)).rejects.toThrow(
			AlreadyMemberError,
		);
		expect(state.members).toHaveLength(1);
		expect(state.invitationStatuses.size).toBe(0);
	});

	it("does not treat membership in ANOTHER org as membership here", async () => {
		const state = freshState([
			{ organizationId: "org-OTHER", userId: "user-2", role: "member" },
		]);
		const db = createMockDb(state);

		await acceptMembershipGuarded(db, baseParams);

		expect(state.members).toHaveLength(2);
	});

	it("throws MemberLimitError at the limit and writes nothing", async () => {
		const state = freshState([
			{ organizationId: "org-1", userId: "owner", role: "owner" },
			{ organizationId: "org-1", userId: "user-9", role: "member" },
		]);
		const db = createMockDb(state);

		await expect(acceptMembershipGuarded(db, baseParams)).rejects.toThrow(
			MemberLimitError,
		);
		expect(state.members).toHaveLength(2);
		expect(state.invitationStatuses.size).toBe(0);
	});

	it("counts only the target org's members toward the limit", async () => {
		const state = freshState([
			{ organizationId: "org-1", userId: "owner", role: "owner" },
			{ organizationId: "org-OTHER", userId: "u1", role: "member" },
			{ organizationId: "org-OTHER", userId: "u2", role: "member" },
		]);
		const db = createMockDb(state);

		await acceptMembershipGuarded(db, baseParams);

		expect(
			state.members.filter((m) => m.organizationId === "org-1"),
		).toHaveLength(2);
	});

	// -------------------------------------------------------------------
	// Race regression tests
	// -------------------------------------------------------------------

	it("RACE: concurrent acceptances cannot exceed the member limit", async () => {
		// Org with 1 owner, limit 2 → exactly ONE free slot. Two users
		// accept concurrently; with the advisory lock serializing the
		// check+insert, exactly one wins and one gets MemberLimitError.
		const state = freshState([
			{ organizationId: "org-1", userId: "owner", role: "owner" },
		]);
		const db = createMockDb(state);

		const results = await Promise.allSettled([
			acceptMembershipGuarded(db, {
				...baseParams,
				userId: "user-A",
				invitationId: "inv-A",
			}),
			acceptMembershipGuarded(db, {
				...baseParams,
				userId: "user-B",
				invitationId: "inv-B",
			}),
		]);

		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter(
			(r): r is PromiseRejectedResult => r.status === "rejected",
		);

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0]!.reason).toBeInstanceOf(MemberLimitError);
		// The org must never exceed its limit.
		expect(
			state.members.filter((m) => m.organizationId === "org-1"),
		).toHaveLength(2);
	});

	it("RACE: concurrent acceptances by the SAME user insert only one row", async () => {
		// Same user accepts two invitations to the same org concurrently.
		const state = freshState([
			{ organizationId: "org-1", userId: "owner", role: "owner" },
		]);
		const db = createMockDb(state);

		const results = await Promise.allSettled([
			acceptMembershipGuarded(db, {
				...baseParams,
				resolveMemberLimit: async () => 6,
				invitationId: "inv-A",
			}),
			acceptMembershipGuarded(db, {
				...baseParams,
				resolveMemberLimit: async () => 6,
				invitationId: "inv-B",
			}),
		]);

		const rejected = results.filter(
			(r): r is PromiseRejectedResult => r.status === "rejected",
		);
		expect(rejected).toHaveLength(1);
		expect(rejected[0]!.reason).toBeInstanceOf(AlreadyMemberError);
		expect(state.members.filter((m) => m.userId === "user-2")).toHaveLength(1);
	});

	it("RACE: the same invitation can transition to accepted only once", async () => {
		const state = freshState([]);
		const db = createMockDb(state);

		const results = await Promise.allSettled([
			acceptMembershipGuarded(db, {
				...baseParams,
				userId: "user-A",
				resolveMemberLimit: async () => 6,
			}),
			acceptMembershipGuarded(db, {
				...baseParams,
				userId: "user-B",
				resolveMemberLimit: async () => 6,
			}),
		]);

		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		const failure = results.find(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		expect(failure?.reason).toBeInstanceOf(InvitationNotAcceptableError);
		expect(state.members).toHaveLength(1);
	});

	it("RACE control: without lock serialization the limit IS exceeded (documents why the lock exists)", async () => {
		// Sanity check that the race test above is actually meaningful:
		// with the advisory lock disabled, both concurrent acceptances
		// pass the count check and the org ends up OVER its limit.
		const state = freshState([
			{ organizationId: "org-1", userId: "owner", role: "owner" },
		]);
		const db = createMockDb(state, { simulateLock: false });

		// Without the lock both transactions interleave at every await
		// boundary, so both count reads happen before either commit.
		const results = await Promise.allSettled([
			acceptMembershipGuarded(db, {
				...baseParams,
				userId: "user-A",
				invitationId: "inv-A",
			}),
			acceptMembershipGuarded(db, {
				...baseParams,
				userId: "user-B",
				invitationId: "inv-B",
			}),
		]);

		expect(results.every((r) => r.status === "fulfilled")).toBe(true);
		expect(
			state.members.filter((m) => m.organizationId === "org-1").length,
		).toBeGreaterThan(2);
	});
});
