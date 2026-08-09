// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Organization Membership Guard
 *
 * Adds a member to an organization with the membership check, the
 * member-limit check, and the insert all inside ONE transaction holding
 * a Postgres advisory lock on the organization. Without the lock,
 * concurrent invitation acceptances both pass the count check and race
 * past the configured member limit (or insert duplicate member rows for the
 * same user).
 */

import { and, count, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema";
import { invitation, member, organization } from "../db/schema";

type DrizzleDB = PostgresJsDatabase<typeof schema>;

/** Thrown when the user is already a member of the organization. */
export class AlreadyMemberError extends Error {
	constructor() {
		super("User is already a member of this organization");
		this.name = "AlreadyMemberError";
	}
}

/** Thrown when the organization is at its configured member limit. */
export class MemberLimitError extends Error {
	constructor(public readonly limit: number) {
		super(`Organization member limit reached (${limit})`);
		this.name = "MemberLimitError";
	}
}

/** Thrown when the account cannot own another organization. */
export class OrganizationLimitError extends Error {
	constructor(public readonly limit: number) {
		super(`Organization limit reached (${limit})`);
		this.name = "OrganizationLimitError";
	}
}

/** Thrown when the same email already has a pending invitation. */
export class InvitationAlreadyExistsError extends Error {
	constructor() {
		super("A pending invitation already exists for this email");
		this.name = "InvitationAlreadyExistsError";
	}
}

/** Thrown when an invitation changed or no longer qualifies for acceptance. */
export class InvitationNotAcceptableError extends Error {
	constructor(
		public readonly reason:
			| "not_found"
			| "organization_mismatch"
			| "email_mismatch"
			| "expired",
	) {
		super(`Invitation cannot be accepted (${reason})`);
		this.name = "InvitationNotAcceptableError";
	}
}

/**
 * Compute a stable signed-bigint advisory lock key for an organization.
 *
 * FNV-1a 64-bit, masked to the positive signed range so org-scoped membership
 * mutations serialize against each other in one key space.
 */
export function orgAdvisoryLockKey(organizationId: string): bigint {
	let hash = BigInt("14695981039346656037"); // FNV offset basis
	const fnvPrime = BigInt("1099511628211");
	for (let i = 0; i < organizationId.length; i++) {
		hash ^= BigInt(organizationId.charCodeAt(i));
		hash = (hash * fnvPrime) & BigInt("0xFFFFFFFFFFFFFFFF");
	}
	return hash & BigInt("0x7FFFFFFFFFFFFFFF");
}

/** Acquire the shared transaction lock used by organization capacity writes. */
export async function acquireOrganizationLock(
	db: Pick<DrizzleDB, "execute">,
	organizationId: string,
): Promise<void> {
	const lockKey = orgAdvisoryLockKey(organizationId);
	await db.execute(
		sql`SELECT pg_advisory_xact_lock(${sql.raw(lockKey.toString())})`,
	);
}

export interface CreateOwnedOrganizationParams {
	userId: string;
	name: string;
	slug: string;
	logo?: string | null;
	resolveLimit: (db: DrizzleDB) => Promise<number>;
}

/**
 * Create an organization and its owner membership under one account-scoped
 * lock, so concurrent requests cannot both consume the final slot.
 */
export async function createOwnedOrganizationGuarded(
	db: DrizzleDB,
	params: CreateOwnedOrganizationParams,
): Promise<typeof organization.$inferSelect> {
	return db.transaction(async (tx) => {
		await acquireOrganizationLock(tx, `owner:${params.userId}`);

		const [ownedCountRow] = await tx
			.select({ value: count() })
			.from(member)
			.innerJoin(organization, eq(member.organizationId, organization.id))
			.where(
				and(
					eq(member.userId, params.userId),
					eq(member.role, "owner"),
					or(
						isNull(organization.metadata),
						sql`COALESCE((${organization.metadata}::jsonb ->> 'type') <> 'family', TRUE)`,
					),
				),
			);
		const limit = await params.resolveLimit(tx);
		if (ownedCountRow!.value >= limit) {
			throw new OrganizationLimitError(limit);
		}

		const anyMembership = await tx.query.member.findFirst({
			where: eq(member.userId, params.userId),
			columns: { id: true },
		});
		const [newOrganization] = await tx
			.insert(organization)
			.values({
				name: params.name,
				slug: params.slug,
				logo: params.logo ?? null,
				createdAt: new Date(),
				ownerId: params.userId,
			})
			.returning();

		await tx.insert(member).values({
			organizationId: newOrganization!.id,
			userId: params.userId,
			role: "owner",
			createdAt: new Date(),
			isDefault: !anyMembership,
		});

		return newOrganization!;
	});
}

export interface AcceptMembershipParams {
	organizationId: string;
	userId: string;
	/** Must match the locked invitation row. */
	email: string;
	/** Invitation row to mark accepted in the same transaction. */
	invitationId: string;
	/** Resolve the limit while holding the org lock (count includes the owner). */
	resolveMemberLimit: (db: DrizzleDB) => Promise<number>;
}

export interface ReserveInvitationParams {
	id: string;
	organizationId: string;
	email: string;
	role: "member" | "admin";
	inviterId: string;
	expiresAt: Date;
	/** Existing account for the email, when one exists. */
	userId?: string;
	resolveMemberLimit: (db: DrizzleDB) => Promise<number>;
}

/**
 * Reserve one member slot with the invitation insert under the org lock.
 *
 * @throws AlreadyMemberError when the invitee is already a member
 * @throws InvitationAlreadyExistsError for a duplicate pending invitation
 * @throws MemberLimitError when members plus pending invitations fill the limit
 */
export async function reserveInvitationGuarded(
	db: DrizzleDB,
	params: ReserveInvitationParams,
): Promise<typeof invitation.$inferSelect> {
	return db.transaction(async (tx) => {
		await acquireOrganizationLock(tx, params.organizationId);
		const now = new Date();

		if (params.userId) {
			const existingMember = await tx.query.member.findFirst({
				where: and(
					eq(member.userId, params.userId),
					eq(member.organizationId, params.organizationId),
				),
				columns: { id: true },
			});
			if (existingMember) throw new AlreadyMemberError();
		}

		const existingInvitation = await tx.query.invitation.findFirst({
			where: and(
				eq(invitation.organizationId, params.organizationId),
				eq(invitation.email, params.email),
				eq(invitation.status, "pending"),
				gt(invitation.expiresAt, now),
			),
			columns: { id: true },
		});
		if (existingInvitation) throw new InvitationAlreadyExistsError();

		const [memberCountRow] = await tx
			.select({ value: count() })
			.from(member)
			.where(eq(member.organizationId, params.organizationId));
		const [pendingCountRow] = await tx
			.select({ value: count() })
			.from(invitation)
			.where(
				and(
					eq(invitation.organizationId, params.organizationId),
					eq(invitation.status, "pending"),
					gt(invitation.expiresAt, now),
				),
			);
		const memberLimit = await params.resolveMemberLimit(tx);
		const used = memberCountRow!.value + pendingCountRow!.value;
		if (used >= memberLimit) throw new MemberLimitError(memberLimit);

		const [created] = await tx
			.insert(invitation)
			.values({
				id: params.id,
				organizationId: params.organizationId,
				email: params.email,
				role: params.role,
				status: "pending",
				expiresAt: params.expiresAt,
				inviterId: params.inviterId,
			})
			.returning();
		return created!;
	});
}

/**
 * Insert the member and mark the invitation accepted, atomically and
 * serialized per organization.
 *
 * @throws AlreadyMemberError when the user already has a member row
 * @throws MemberLimitError when the org is at `memberLimit`
 */
export async function acceptMembershipGuarded(
	db: DrizzleDB,
	params: AcceptMembershipParams,
): Promise<void> {
	const { organizationId, userId, email, invitationId, resolveMemberLimit } =
		params;

	await db.transaction(async (tx) => {
		await acquireOrganizationLock(tx, organizationId);
		const lockedInvitation = await tx.query.invitation.findFirst({
			where: eq(invitation.id, invitationId),
		});
		if (!lockedInvitation) {
			throw new InvitationNotAcceptableError("not_found");
		}
		if (lockedInvitation.organizationId !== organizationId) {
			throw new InvitationNotAcceptableError("organization_mismatch");
		}
		if (lockedInvitation.email !== email) {
			throw new InvitationNotAcceptableError("email_mismatch");
		}
		const now = new Date();
		if (
			lockedInvitation.status !== "pending" ||
			lockedInvitation.expiresAt <= now
		) {
			throw new InvitationNotAcceptableError("expired");
		}

		const existingMember = await tx.query.member.findFirst({
			where: and(
				eq(member.userId, userId),
				eq(member.organizationId, organizationId),
			),
		});
		if (existingMember) {
			throw new AlreadyMemberError();
		}

		const [memberCountRow] = await tx
			.select({ value: count() })
			.from(member)
			.where(eq(member.organizationId, organizationId));
		const total = memberCountRow!.value;
		const memberLimit = await resolveMemberLimit(tx);
		if (total >= memberLimit) {
			throw new MemberLimitError(memberLimit);
		}

		const acceptedAt = new Date();
		const [acceptedInvitation] = await tx
			.update(invitation)
			.set({ status: "accepted" })
			.where(
				and(
					eq(invitation.id, invitationId),
					eq(invitation.organizationId, organizationId),
					eq(invitation.email, email),
					eq(invitation.status, "pending"),
					gt(invitation.expiresAt, acceptedAt),
				),
			)
			.returning({ id: invitation.id });
		if (!acceptedInvitation) {
			throw new InvitationNotAcceptableError("expired");
		}

		await tx.insert(member).values({
			organizationId,
			userId,
			role: lockedInvitation.role === "admin" ? "admin" : "member",
			createdAt: new Date(),
		});
	});
}
