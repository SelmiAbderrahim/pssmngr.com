// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import {
	device,
	ephemeralShare,
	item,
	shareEnvelope,
	user,
} from "@pssmngr/server/db/schema";
import {
	badRequestError,
	forbiddenError,
	notFoundError,
} from "@pssmngr/server/i18n/errors";
import { encryptedField } from "@pssmngr/server/lib/encrypted-payload";
import { getClientIp } from "@pssmngr/server/middleware/rate-limiter";
import { createNotification } from "@pssmngr/server/services/notification";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { TFunction } from "i18next";
import { z } from "zod/v3";
import {
	type Context,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "../trpc";

type SharingDb = Context["db"];

/**
 * Verify the item belongs to one of the user's vaults and is not trashed.
 */
async function verifyItemOwnership(
	db: SharingDb,
	itemId: string,
	userId: string,
	t: TFunction,
) {
	const found = await db.query.item.findFirst({
		where: and(eq(item.id, itemId), isNull(item.deletedAt)),
		with: { vault: { columns: { userId: true } } },
	});

	if (!found || found.vault.userId !== userId) {
		throw notFoundError(t, "item");
	}

	return found;
}

/**
 * Fetch a share envelope and verify it's not revoked or expired.
 */
async function getActiveShare(db: SharingDb, shareId: string, t: TFunction) {
	const found = await db.query.shareEnvelope.findFirst({
		where: eq(shareEnvelope.id, shareId),
	});

	if (!found) {
		throw notFoundError(t, "share");
	}

	if (found.revokedAt) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: t("errors:sharing.revoked"),
		});
	}

	if (found.expiresAt && found.expiresAt < new Date()) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: t("errors:sharing.expired"),
		});
	}

	return found;
}

export const sharingRouter = createTRPCRouter({
	/**
	 * Create a share envelope with a wrapped data key for the recipient.
	 * Only the item owner can share it.
	 */
	shareItem: protectedProcedure
		.input(
			z
				.object({
					itemId: z.string().min(1),
					recipientUserId: z.string().min(1),
					wrappedKey: encryptedField,
					wrappedKeyNonce: encryptedField,
					wrappedKeyAuthTag: encryptedField,
					senderSignature: encryptedField,
					permission: z.enum(["view", "edit", "share"]).default("view"),
					expiresAt: z.string().datetime().optional(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			// Verify sender owns the item
			await verifyItemOwnership(ctx.db, input.itemId, ctx.user.id, ctx.t);

			// Cannot share with yourself
			if (input.recipientUserId === ctx.user.id) {
				throw badRequestError(ctx.t, "errors:sharing.cannotShareWithSelf");
			}

			const [created] = await ctx.db
				.insert(shareEnvelope)
				.values({
					itemId: input.itemId,
					senderUserId: ctx.user.id,
					recipientUserId: input.recipientUserId,
					wrappedKey: input.wrappedKey,
					wrappedKeyNonce: input.wrappedKeyNonce,
					wrappedKeyAuthTag: input.wrappedKeyAuthTag,
					senderSignature: input.senderSignature,
					permission: input.permission,
					expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
				})
				.returning();

			// Notify recipient (fire-and-forget, don't block the response)
			createNotification({
				userId: input.recipientUserId,
				category: "sharing",
				title: "Item shared with you",
				message: `${ctx.user.email} shared an item with you.`,
			}).catch(() => {
				// Non-critical — log but don't fail the share
			});

			return created;
		}),

	/**
	 * Look up a recipient by email for sharing.
	 * Returns the user's ID and their device's X25519 public key.
	 */
	lookupRecipientByEmail: protectedProcedure
		.input(z.object({ email: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			const recipient = await ctx.db.query.user.findFirst({
				where: eq(user.email, input.email.toLowerCase().trim()),
				columns: { id: true },
			});

			if (!recipient) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t(
						"errors:sharing.recipientNotFound",
						"Recipient not found",
					),
				});
			}

			if (recipient.id === ctx.user.id) {
				throw badRequestError(ctx.t, "errors:sharing.cannotShareWithSelf");
			}

			const dev = await ctx.db.query.device.findFirst({
				where: eq(device.userId, recipient.id),
				orderBy: (d, { desc }) => [desc(d.trusted), desc(d.lastSeen)],
				columns: { publicKey: true },
			});

			if (!dev?.publicKey) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t(
						"errors:sharing.recipientNoDevice",
						"Recipient has no registered device",
					),
				});
			}

			return {
				userId: recipient.id,
				publicKey: dev.publicKey,
			};
		}),

	/**
	 * Accept a share. Only the recipient can accept.
	 */
	acceptShare: protectedProcedure
		.input(z.object({ shareId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const share = await getActiveShare(ctx.db, input.shareId, ctx.t);

			if (share.recipientUserId !== ctx.user.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:sharing.notRecipient"),
				});
			}

			const [updated] = await ctx.db
				.update(shareEnvelope)
				.set({ accepted: true })
				.where(eq(shareEnvelope.id, input.shareId))
				.returning();

			return updated;
		}),

	/**
	 * Decline a share. Only the recipient can decline.
	 * Declining revokes the share permanently.
	 */
	declineShare: protectedProcedure
		.input(z.object({ shareId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const share = await getActiveShare(ctx.db, input.shareId, ctx.t);

			if (share.recipientUserId !== ctx.user.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:sharing.notRecipient"),
				});
			}

			const [updated] = await ctx.db
				.update(shareEnvelope)
				.set({ revokedAt: new Date() })
				.where(eq(shareEnvelope.id, input.shareId))
				.returning();

			return updated;
		}),

	/**
	 * Revoke a share. Only the sender (item owner) can revoke.
	 */
	revokeShare: protectedProcedure
		.input(z.object({ shareId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const share = await ctx.db.query.shareEnvelope.findFirst({
				where: eq(shareEnvelope.id, input.shareId),
			});

			if (!share) {
				throw notFoundError(ctx.t, "share");
			}

			if (share.senderUserId !== ctx.user.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:sharing.onlySenderCanRevoke"),
				});
			}

			if (share.revokedAt) {
				throw badRequestError(ctx.t, "errors:sharing.alreadyRevoked");
			}

			const [updated] = await ctx.db
				.update(shareEnvelope)
				.set({ revokedAt: new Date() })
				.where(eq(shareEnvelope.id, input.shareId))
				.returning();

			return updated;
		}),

	/**
	 * List shares sent by the current user.
	 */
	listSentShares: protectedProcedure
		.input(
			z
				.object({
					includeRevoked: z.boolean().default(false),
				})
				.strict()
				.optional(),
		)
		.query(async ({ input, ctx }) => {
			const conditions = [eq(shareEnvelope.senderUserId, ctx.user.id)];

			if (!input?.includeRevoked) {
				conditions.push(isNull(shareEnvelope.revokedAt));
			}

			const envelopes = await ctx.db.query.shareEnvelope.findMany({
				where: and(...conditions),
				orderBy: (s, { desc }) => [desc(s.createdAt)],
				with: {
					item: { columns: { itemType: true } },
					sender: { columns: { id: true, email: true, name: true } },
					recipient: { columns: { id: true, email: true, name: true } },
				},
			});

			return envelopes.map((env) => {
				const status = env.revokedAt
					? "revoked"
					: env.accepted
						? "accepted"
						: "pending";

				return {
					id: env.id,
					itemId: env.itemId,
					itemTitle: "",
					itemType: env.item?.itemType ?? "login",
					senderId: env.senderUserId,
					senderEmail: env.sender?.email ?? "",
					senderName: env.sender?.name || undefined,
					recipientId: env.recipientUserId,
					recipientEmail: env.recipient?.email ?? "",
					recipientName: env.recipient?.name || undefined,
					permission: env.permission,
					status,
					createdAt: env.createdAt.toISOString(),
					expiresAt: env.expiresAt?.toISOString() ?? undefined,
				};
			});
		}),

	/**
	 * List shares received by the current user.
	 */
	listReceivedShares: protectedProcedure
		.input(
			z
				.object({
					includeRevoked: z.boolean().default(false),
				})
				.strict()
				.optional(),
		)
		.query(async ({ input, ctx }) => {
			const conditions = [eq(shareEnvelope.recipientUserId, ctx.user.id)];

			if (!input?.includeRevoked) {
				conditions.push(isNull(shareEnvelope.revokedAt));
			}

			const envelopes = await ctx.db.query.shareEnvelope.findMany({
				where: and(...conditions),
				orderBy: (s, { desc }) => [desc(s.createdAt)],
				with: {
					item: { columns: { itemType: true } },
					sender: { columns: { id: true, email: true, name: true } },
					recipient: { columns: { id: true, email: true, name: true } },
				},
			});

			return envelopes.map((env) => {
				const status = env.revokedAt
					? "revoked"
					: env.accepted
						? "accepted"
						: "pending";

				return {
					id: env.id,
					itemId: env.itemId,
					itemTitle: "",
					itemType: env.item?.itemType ?? "login",
					senderId: env.senderUserId,
					senderEmail: env.sender?.email ?? "",
					senderName: env.sender?.name || undefined,
					recipientId: env.recipientUserId,
					recipientEmail: env.recipient?.email ?? "",
					recipientName: env.recipient?.name || undefined,
					permission: env.permission,
					status,
					createdAt: env.createdAt.toISOString(),
					expiresAt: env.expiresAt?.toISOString() ?? undefined,
				};
			});
		}),

	/**
	 * Get a share envelope for decryption. Accessible by sender or recipient.
	 */
	getShareEnvelope: protectedProcedure
		.input(z.object({ shareId: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			const share = await ctx.db.query.shareEnvelope.findFirst({
				where: eq(shareEnvelope.id, input.shareId),
			});

			if (!share) {
				throw notFoundError(ctx.t, "share");
			}

			// Only sender or recipient can access the envelope
			if (
				share.senderUserId !== ctx.user.id &&
				share.recipientUserId !== ctx.user.id
			) {
				throw forbiddenError(ctx.t);
			}

			if (share.revokedAt) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:sharing.revoked"),
				});
			}

			if (share.expiresAt && share.expiresAt < new Date()) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:sharing.expired"),
				});
			}

			return share;
		}),

	// ── Ephemeral sharing links ────────────────────────────────────────

	/**
	 * Create an ephemeral sharing link.
	 * The encrypted blob is stored on the server; the decryption key lives
	 * only in the URL fragment and never reaches the server.
	 */
	createEphemeralLink: protectedProcedure
		.input(
			z
				.object({
					encryptedBlob: z.string().min(1).max(65536),
					nonce: z.string().min(1).max(256),
					authTag: z.string().min(1).max(256),
					hasPassphrase: z.boolean().default(false),
					passphraseSalt: z.string().nullable().default(null),
					expiresIn: z.enum(["1h", "24h", "7d"]),
					maxAccesses: z.number().int().min(1).max(100).default(1),
					ipRestriction: z.string().max(45).nullable().default(null),
					label: z.string().max(200).nullable().default(null),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const durations: Record<string, number> = {
				"1h": 60 * 60 * 1000,
				"24h": 24 * 60 * 60 * 1000,
				"7d": 7 * 24 * 60 * 60 * 1000,
			};
			const expiresAt = new Date(Date.now() + durations[input.expiresIn]!);

			const [created] = await ctx.db
				.insert(ephemeralShare)
				.values({
					senderUserId: ctx.user.id,
					encryptedBlob: input.encryptedBlob,
					nonce: input.nonce,
					authTag: input.authTag,
					hasPassphrase: input.hasPassphrase,
					passphraseSalt: input.passphraseSalt,
					expiresAt,
					maxAccesses: input.maxAccesses,
					ipRestriction: input.ipRestriction,
					label: input.label,
				})
				.returning();

			return { id: created!.id, expiresAt: created!.expiresAt.toISOString() };
		}),

	/**
	 * Access an ephemeral link (public — no authentication required).
	 * Returns the encrypted blob for client-side decryption.
	 * Uses an atomic UPDATE to enforce expiry, one-time use, and IP restriction
	 * without race conditions.
	 */
	accessEphemeralLink: publicProcedure
		.input(z.object({ linkId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			// Check IP restriction before consuming an access
			const link = await ctx.db.query.ephemeralShare.findFirst({
				where: eq(ephemeralShare.id, input.linkId),
				columns: { ipRestriction: true },
			});

			if (!link) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:sharing.linkUnavailable"),
				});
			}

			if (link.ipRestriction) {
				const clientIp = getClientIp(ctx.req);
				if (!clientIp || clientIp !== link.ipRestriction) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: ctx.t("errors:sharing.linkUnavailable"),
					});
				}
			}

			// Atomic: increment access count only if link is valid and not exhausted.
			// This prevents race conditions where two concurrent requests both pass
			// the access count check.
			const [accessed] = await ctx.db
				.update(ephemeralShare)
				.set({
					accessCount: sql`${ephemeralShare.accessCount} + 1`,
					firstAccessedAt: sql`COALESCE(${ephemeralShare.firstAccessedAt}, NOW())`,
				})
				.where(
					and(
						eq(ephemeralShare.id, input.linkId),
						isNull(ephemeralShare.revokedAt),
						gt(ephemeralShare.expiresAt, new Date()),
						lt(ephemeralShare.accessCount, ephemeralShare.maxAccesses),
					),
				)
				.returning({
					encryptedBlob: ephemeralShare.encryptedBlob,
					nonce: ephemeralShare.nonce,
					authTag: ephemeralShare.authTag,
					hasPassphrase: ephemeralShare.hasPassphrase,
					passphraseSalt: ephemeralShare.passphraseSalt,
				});

			if (!accessed) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:sharing.linkUnavailable"),
				});
			}

			return accessed;
		}),

	/**
	 * List ephemeral links created by the current user.
	 */
	listEphemeralLinks: protectedProcedure
		.input(
			z
				.object({
					includeRevoked: z.boolean().default(false),
				})
				.strict()
				.optional(),
		)
		.query(async ({ input, ctx }) => {
			const conditions = [eq(ephemeralShare.senderUserId, ctx.user.id)];

			if (!input?.includeRevoked) {
				conditions.push(isNull(ephemeralShare.revokedAt));
			}

			return ctx.db.query.ephemeralShare.findMany({
				where: and(...conditions),
				columns: {
					id: true,
					label: true,
					hasPassphrase: true,
					expiresAt: true,
					maxAccesses: true,
					accessCount: true,
					firstAccessedAt: true,
					ipRestriction: true,
					revokedAt: true,
					createdAt: true,
				},
				orderBy: (s) => [desc(s.createdAt)],
			});
		}),

	/**
	 * Revoke an ephemeral link. Only the sender can revoke.
	 */
	revokeEphemeralLink: protectedProcedure
		.input(z.object({ linkId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const link = await ctx.db.query.ephemeralShare.findFirst({
				where: eq(ephemeralShare.id, input.linkId),
			});

			if (!link) {
				throw notFoundError(ctx.t, "link");
			}

			if (link.senderUserId !== ctx.user.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:sharing.onlyCreatorCanRevoke"),
				});
			}

			if (link.revokedAt) {
				throw badRequestError(ctx.t, "errors:sharing.linkAlreadyRevoked");
			}

			const [updated] = await ctx.db
				.update(ephemeralShare)
				.set({ revokedAt: new Date() })
				.where(eq(ephemeralShare.id, input.linkId))
				.returning();

			return updated;
		}),
});
