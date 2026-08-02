// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import {
	emergencyAccessRequest,
	emergencyAuditLog,
	notifications,
	trustedContact,
	user,
} from "@pssmngr/server/db/schema";
import { badRequestError } from "@pssmngr/server/i18n/errors";
import {
	encryptedField,
	smallBlob,
} from "@pssmngr/server/lib/encrypted-payload";
import {
	DENIAL_COOLDOWN_MS,
	signTimestamp,
	verifyTimestamp,
} from "@pssmngr/server/utils/emergency-timelock";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod/v3";
import { type Context, createTRPCRouter, protectedProcedure } from "../trpc";

/** Minimum waiting period in days. */
const MIN_WAITING_DAYS = 1;

/** Maximum waiting period in days. */
const MAX_WAITING_DAYS = 30;

/** Default waiting period in days. */
const DEFAULT_WAITING_DAYS = 7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DbContext = Context["db"];

/**
 * Find a trusted contact relationship between owner and contact.
 */
async function findTrustedContact(
	db: DbContext,
	ownerId: string,
	contactId: string,
) {
	return db.query.trustedContact.findFirst({
		where: and(
			eq(trustedContact.ownerId, ownerId),
			eq(trustedContact.contactId, contactId),
		),
	});
}

/**
 * Write an immutable audit log entry for an emergency access event.
 */
async function writeAuditLog(
	db: DbContext,
	requestId: string,
	event: (typeof emergencyAuditLog.$inferInsert)["event"],
	actorId: string | null,
	metadata?: string,
) {
	await db.insert(emergencyAuditLog).values({
		requestId,
		event,
		actorId,
		metadata: metadata ?? null,
	});
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const emergencyRouter = createTRPCRouter({
	/**
	 * Add a user as a trusted contact with a configurable waiting period.
	 * Only the vault owner calls this.
	 */
	addTrustedContact: protectedProcedure
		.input(
			z
				.object({
					contactEmail: z.string().email(),
					waitingPeriodDays: z
						.number()
						.int()
						.min(MIN_WAITING_DAYS)
						.max(MAX_WAITING_DAYS)
						.default(DEFAULT_WAITING_DAYS),
					// Pre-stored escrow — vault key encrypted for the contact's public key.
					// Created client-side, opaque to server. Activated after timer expiry.
					escrow: z
						.object({
							escrowBlob: smallBlob,
							escrowNonce: encryptedField,
							escrowAuthTag: encryptedField,
							ephemeralPublicKey: encryptedField,
							escrowSignature: encryptedField,
						})
						.optional(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			// Find the contact user
			const contactUser = await ctx.db.query.user.findFirst({
				where: eq(user.email, input.contactEmail),
			});

			if (!contactUser) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:emergency.userNotFound"),
				});
			}

			if (contactUser.id === ctx.user.id) {
				throw badRequestError(ctx.t, "errors:emergency.cannotAddSelf");
			}

			// Check not already a trusted contact
			const existing = await findTrustedContact(
				ctx.db,
				ctx.user.id,
				contactUser.id,
			);

			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: ctx.t("errors:emergency.alreadyTrusted"),
				});
			}

			const [created] = await ctx.db
				.insert(trustedContact)
				.values({
					ownerId: ctx.user.id,
					contactId: contactUser.id,
					waitingPeriodDays: input.waitingPeriodDays,
					...(input.escrow && {
						escrowBlob: input.escrow.escrowBlob,
						escrowNonce: input.escrow.escrowNonce,
						escrowAuthTag: input.escrow.escrowAuthTag,
						ephemeralPublicKey: input.escrow.ephemeralPublicKey,
						escrowSignature: input.escrow.escrowSignature,
					}),
				})
				.returning();

			// Notify the contact
			await ctx.db.insert(notifications).values({
				userId: contactUser.id,
				category: "security",
				title: ctx.t("errors:emergency.notifications.trustAddedTitle"),
				message: ctx.t("errors:emergency.notifications.trustAddedMessage", {
					name: ctx.user.name || ctx.user.email || "",
				}),
			});

			return {
				id: created!.id,
				contactId: contactUser.id,
				waitingPeriodDays: created!.waitingPeriodDays,
			};
		}),

	/**
	 * Remove a trusted contact. Only the vault owner calls this.
	 */
	removeTrustedContact: protectedProcedure
		.input(z.object({ trustedContactId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const tc = await ctx.db.query.trustedContact.findFirst({
				where: and(
					eq(trustedContact.id, input.trustedContactId),
					eq(trustedContact.ownerId, ctx.user.id),
				),
			});

			if (!tc) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:emergency.contactNotFound"),
				});
			}

			// Cancel any pending requests for this contact
			await ctx.db
				.update(emergencyAccessRequest)
				.set({ status: "denied", deniedAt: new Date() })
				.where(
					and(
						eq(emergencyAccessRequest.trustedContactId, input.trustedContactId),
						eq(emergencyAccessRequest.status, "pending"),
					),
				);

			await ctx.db
				.delete(trustedContact)
				.where(eq(trustedContact.id, input.trustedContactId));

			return { success: true };
		}),

	/**
	 * List all trusted contacts for the current user (as vault owner).
	 */
	listTrustedContacts: protectedProcedure.query(async ({ ctx }) => {
		const contacts = await ctx.db.query.trustedContact.findMany({
			where: eq(trustedContact.ownerId, ctx.user.id),
			with: {
				contact: {
					columns: { id: true, name: true, email: true, image: true },
				},
			},
			orderBy: (tc, { asc }) => [asc(tc.createdAt)],
		});

		return contacts.map((tc) => ({
			id: tc.id,
			waitingPeriodDays: tc.waitingPeriodDays,
			createdAt: tc.createdAt.toISOString(),
			contact: {
				id: tc.contact.id,
				name: tc.contact.name,
				email: tc.contact.email,
				image: tc.contact.image,
			},
		}));
	}),

	/**
	 * List vault owners who selected the current user as a trusted contact.
	 * This is the contact-side entry point for creating the first request.
	 */
	listEmergencyOwners: protectedProcedure.query(async ({ ctx }) => {
		const relationships = await ctx.db.query.trustedContact.findMany({
			where: eq(trustedContact.contactId, ctx.user.id),
			with: {
				owner: {
					columns: { id: true, name: true, email: true, image: true },
				},
			},
			orderBy: (tc, { asc }) => [asc(tc.createdAt)],
		});

		return relationships.map((tc) => ({
			trustedContactId: tc.id,
			waitingPeriodDays: tc.waitingPeriodDays,
			owner: {
				id: tc.owner.id,
				name: tc.owner.name,
				email: tc.owner.email,
				image: tc.owner.image,
			},
		}));
	}),

	/**
	 * Contact requests vault access. Starts the time-lock timer.
	 * The waiting period is locked at request time and cannot be shortened.
	 * Server signs the timestamp to prevent client manipulation.
	 */
	requestAccess: protectedProcedure
		.input(z.object({ trustedContactId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const tc = await ctx.db.query.trustedContact.findFirst({
				where: and(
					eq(trustedContact.id, input.trustedContactId),
					eq(trustedContact.contactId, ctx.user.id),
				),
			});

			if (!tc) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:emergency.relationshipNotFound"),
				});
			}

			// Check no active request already exists
			const existing = await ctx.db.query.emergencyAccessRequest.findFirst({
				where: and(
					eq(emergencyAccessRequest.trustedContactId, input.trustedContactId),
					eq(emergencyAccessRequest.contactId, ctx.user.id),
					eq(emergencyAccessRequest.status, "pending"),
				),
			});

			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: ctx.t("errors:emergency.requestPending"),
				});
			}

			// Check 24h cooldown after denial
			const lastDenied = await ctx.db.query.emergencyAccessRequest.findFirst({
				where: and(
					eq(emergencyAccessRequest.trustedContactId, input.trustedContactId),
					eq(emergencyAccessRequest.contactId, ctx.user.id),
					eq(emergencyAccessRequest.status, "denied"),
				),
				orderBy: (r, { desc }) => [desc(r.deniedAt)],
			});

			if (lastDenied?.denialCooldownUntil) {
				if (new Date() < lastDenied.denialCooldownUntil) {
					await writeAuditLog(
						ctx.db,
						lastDenied.id,
						"cooldown_blocked",
						ctx.user.id,
						`Retry blocked until ${lastDenied.denialCooldownUntil.toISOString()}`,
					);
					throw new TRPCError({
						code: "TOO_MANY_REQUESTS",
						message: ctx.t("errors:emergency.cooldownBlocked", {
							until: lastDenied.denialCooldownUntil.toISOString(),
						}),
					});
				}
			}

			// Lock the waiting period at request time
			const waitingPeriodDays = tc.waitingPeriodDays;
			const requestedAt = new Date();
			const expiresAt = new Date(
				requestedAt.getTime() + waitingPeriodDays * 24 * 60 * 60 * 1000,
			);

			// Pre-generate ID so we can sign it
			const requestId = nanoid();

			// Sign the timestamps server-side (tamper-proof)
			const timestampSignature = signTimestamp(
				requestId,
				requestedAt,
				expiresAt,
				waitingPeriodDays,
			);

			const [req] = await ctx.db
				.insert(emergencyAccessRequest)
				.values({
					id: requestId,
					trustedContactId: tc.id,
					ownerId: tc.ownerId,
					contactId: ctx.user.id,
					waitingPeriodDays,
					requestedAt,
					expiresAt,
					timestampSignature,
				})
				.returning();

			// Audit log
			await writeAuditLog(
				ctx.db,
				req!.id,
				"request_created",
				ctx.user.id,
				`Waiting period: ${waitingPeriodDays}d, expires: ${expiresAt.toISOString()}`,
			);

			// Notify the vault owner immediately
			await ctx.db.insert(notifications).values({
				userId: tc.ownerId,
				category: "security",
				title: ctx.t("errors:emergency.notifications.accessRequestedTitle"),
				message: ctx.t(
					"errors:emergency.notifications.accessRequestedMessage",
					{
						name: ctx.user.name || ctx.user.email || "",
						days: waitingPeriodDays,
					},
				),
			});

			return {
				id: req!.id,
				status: req!.status,
				waitingPeriodDays: req!.waitingPeriodDays,
				expiresAt: req!.expiresAt.toISOString(),
			};
		}),

	/**
	 * Owner denies an emergency access request, cancelling the timer.
	 * Sets a 24-hour cooldown preventing the contact from retrying.
	 */
	denyRequest: protectedProcedure
		.input(z.object({ requestId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const req = await ctx.db.query.emergencyAccessRequest.findFirst({
				where: and(
					eq(emergencyAccessRequest.id, input.requestId),
					eq(emergencyAccessRequest.ownerId, ctx.user.id),
				),
			});

			if (!req) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:emergency.requestNotFound"),
				});
			}

			if (req.status !== "pending") {
				throw badRequestError(ctx.t, "errors:emergency.cannotDenyStatus", {
					status: req.status,
				});
			}

			const now = new Date();
			const denialCooldownUntil = new Date(now.getTime() + DENIAL_COOLDOWN_MS);

			const [updated] = await ctx.db
				.update(emergencyAccessRequest)
				.set({
					status: "denied",
					deniedAt: now,
					denialCooldownUntil,
				})
				.where(eq(emergencyAccessRequest.id, req.id))
				.returning();

			// Audit log
			await writeAuditLog(
				ctx.db,
				req.id,
				"request_denied",
				ctx.user.id,
				`Cooldown until: ${denialCooldownUntil.toISOString()}`,
			);

			// Notify the contact
			await ctx.db.insert(notifications).values({
				userId: req.contactId,
				category: "security",
				title: ctx.t("errors:emergency.notifications.accessDeniedTitle"),
				message: ctx.t("errors:emergency.notifications.accessDeniedMessage"),
			});

			return { id: updated!.id, status: updated!.status };
		}),

	/**
	 * Grant access after timer expiry. Verifies the server-signed timestamp
	 * before granting. Requires the escrow blob (vault key encrypted for
	 * the contact).
	 */
	grantAccess: protectedProcedure
		.input(
			z
				.object({
					requestId: z.string().min(1),
					escrowBlob: smallBlob,
					escrowNonce: encryptedField,
					escrowAuthTag: encryptedField,
					ephemeralPublicKey: encryptedField,
					escrowSignature: encryptedField.optional(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const req = await ctx.db.query.emergencyAccessRequest.findFirst({
				where: and(
					eq(emergencyAccessRequest.id, input.requestId),
					eq(emergencyAccessRequest.ownerId, ctx.user.id),
				),
			});

			if (!req) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:emergency.requestNotFound"),
				});
			}

			if (req.status !== "pending") {
				throw badRequestError(ctx.t, "errors:emergency.cannotGrantStatus", {
					status: req.status,
				});
			}

			// Verify the server-signed timestamp has not been tampered with
			const signatureValid = verifyTimestamp(
				req.id,
				req.requestedAt,
				req.expiresAt,
				req.waitingPeriodDays,
				req.timestampSignature,
			);

			if (!signatureValid) {
				await writeAuditLog(
					ctx.db,
					req.id,
					"signature_failed",
					ctx.user.id,
					"Timestamp signature verification failed on grant attempt",
				);
				throw badRequestError(
					ctx.t,
					"errors:emergency.signatureVerificationFailed",
				);
			}

			await writeAuditLog(ctx.db, req.id, "signature_verified", ctx.user.id);

			// Timer must have expired
			if (req.expiresAt > new Date()) {
				throw badRequestError(
					ctx.t,
					"errors:emergency.waitingPeriodNotExpired",
				);
			}

			const [updated] = await ctx.db
				.update(emergencyAccessRequest)
				.set({
					status: "approved",
					grantedAt: new Date(),
					escrowBlob: input.escrowBlob,
					escrowNonce: input.escrowNonce,
					escrowAuthTag: input.escrowAuthTag,
					ephemeralPublicKey: input.ephemeralPublicKey,
					escrowSignature: input.escrowSignature ?? null,
				})
				.where(eq(emergencyAccessRequest.id, req.id))
				.returning();

			// Audit log
			await writeAuditLog(ctx.db, req.id, "request_granted", ctx.user.id);

			// Notify the contact
			await ctx.db.insert(notifications).values({
				userId: req.contactId,
				category: "security",
				title: ctx.t("errors:emergency.notifications.accessGrantedTitle"),
				message: ctx.t("errors:emergency.notifications.accessGrantedMessage"),
			});

			return { id: updated!.id, status: updated!.status };
		}),

	/**
	 * Verify the signed timestamp of a request. Useful for clients
	 * to confirm the timer is authentic before waiting.
	 */
	verifyRequestSignature: protectedProcedure
		.input(z.object({ requestId: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			const req = await ctx.db.query.emergencyAccessRequest.findFirst({
				where: and(
					eq(emergencyAccessRequest.id, input.requestId),
					// Both owner and contact can verify
					// (check either field matches)
				),
			});

			if (!req) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:emergency.requestNotFound"),
				});
			}

			// Only owner or contact can verify
			if (req.ownerId !== ctx.user.id && req.contactId !== ctx.user.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:emergency.requestNotFound"),
				});
			}

			const valid = verifyTimestamp(
				req.id,
				req.requestedAt,
				req.expiresAt,
				req.waitingPeriodDays,
				req.timestampSignature,
			);

			return {
				valid,
				requestedAt: req.requestedAt.toISOString(),
				expiresAt: req.expiresAt.toISOString(),
				waitingPeriodDays: req.waitingPeriodDays,
			};
		}),

	/**
	 * List all pending/completed requests for the current user.
	 * Works for both owners (incoming) and contacts (outgoing).
	 */
	listRequests: protectedProcedure
		.input(
			z
				.object({
					role: z.enum(["owner", "contact"]).default("owner"),
				})
				.strict()
				.optional(),
		)
		.query(async ({ input, ctx }) => {
			const role = input?.role ?? "owner";
			const filterField =
				role === "owner"
					? emergencyAccessRequest.ownerId
					: emergencyAccessRequest.contactId;

			const requests = await ctx.db.query.emergencyAccessRequest.findMany({
				where: eq(filterField, ctx.user.id),
				with: {
					owner: {
						columns: {
							id: true,
							name: true,
							email: true,
							image: true,
						},
					},
					contact: {
						columns: {
							id: true,
							name: true,
							email: true,
							image: true,
						},
					},
				},
				orderBy: (r, { desc }) => [desc(r.requestedAt)],
			});

			return requests.map((r) => ({
				id: r.id,
				trustedContactId: r.trustedContactId,
				status: r.status,
				waitingPeriodDays: r.waitingPeriodDays,
				requestedAt: r.requestedAt.toISOString(),
				expiresAt: r.expiresAt.toISOString(),
				deniedAt: r.deniedAt?.toISOString() ?? null,
				grantedAt: r.grantedAt?.toISOString() ?? null,
				owner: {
					id: r.owner.id,
					name: r.owner.name,
					email: r.owner.email,
					image: r.owner.image,
				},
				contact: {
					id: r.contact.id,
					name: r.contact.name,
					email: r.contact.email,
					image: r.contact.image,
				},
			}));
		}),

	/**
	 * Get the escrow blob after access has been granted.
	 * Only the contact who was granted access can retrieve this.
	 */
	getEscrowBlob: protectedProcedure
		.input(z.object({ requestId: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			const req = await ctx.db.query.emergencyAccessRequest.findFirst({
				where: and(
					eq(emergencyAccessRequest.id, input.requestId),
					eq(emergencyAccessRequest.contactId, ctx.user.id),
				),
			});

			if (!req) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:emergency.requestNotFound"),
				});
			}

			if (req.status !== "approved") {
				throw badRequestError(ctx.t, "errors:emergency.accessNotGranted");
			}

			if (
				!req.escrowBlob ||
				!req.escrowNonce ||
				!req.escrowAuthTag ||
				!req.ephemeralPublicKey
			) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: ctx.t("errors:emergency.escrowDataMissing"),
				});
			}

			return {
				escrowBlob: req.escrowBlob,
				escrowNonce: req.escrowNonce,
				escrowAuthTag: req.escrowAuthTag,
				ephemeralPublicKey: req.ephemeralPublicKey,
				escrowSignature: req.escrowSignature,
			};
		}),

	/**
	 * Get the audit log for a specific request.
	 * Only the owner or contact can view.
	 */
	getAuditLog: protectedProcedure
		.input(z.object({ requestId: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			const req = await ctx.db.query.emergencyAccessRequest.findFirst({
				where: eq(emergencyAccessRequest.id, input.requestId),
			});

			if (!req) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:emergency.requestNotFound"),
				});
			}

			if (req.ownerId !== ctx.user.id && req.contactId !== ctx.user.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:emergency.requestNotFound"),
				});
			}

			const logs = await ctx.db.query.emergencyAuditLog.findMany({
				where: eq(emergencyAuditLog.requestId, input.requestId),
				orderBy: (l, { asc }) => [asc(l.createdAt)],
			});

			return logs.map((l) => ({
				id: l.id,
				event: l.event,
				actorId: l.actorId,
				metadata: l.metadata,
				createdAt: l.createdAt.toISOString(),
			}));
		}),
});
