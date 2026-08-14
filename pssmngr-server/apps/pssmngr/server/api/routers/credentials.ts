// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { item, itemVersion, vault } from "@pssmngr/server/db/schema";
import { notFoundError } from "@pssmngr/server/i18n/errors";
import {
	idempotencyKeyZodSchema,
	runWithIdempotency,
} from "@pssmngr/server/idempotency";
import { encryptedItemFields } from "@pssmngr/server/lib/encrypted-payload";
import { and, eq, gt, isNotNull, isNull, lt } from "drizzle-orm";
import type { TFunction } from "i18next";
import { z } from "zod/v3";
import { type Context, createTRPCRouter, protectedProcedure } from "../trpc";

type Db = Context["db"];

const itemTypeValues = [
	"login",
	"passkey",
	"identity",
	"card",
	"note",
	"totp",
	"file",
] as const;

function activeOrganizationId(
	session: { activeOrganizationId?: string | null } | null,
) {
	return session?.activeOrganizationId || null;
}

/**
 * Resolve the organization to scope a vault operation to.
 *
 * The client passes the workspace org it is actually viewing; the server
 * session's `activeOrganizationId` is only a fallback. This prevents a stale
 * session (e.g. the session sync lagging a workspace switch on a fresh page
 * load) from scoping a vault write to the wrong organization and 404-ing —
 * ownership is still enforced by `verifyVaultOwnership`, so an explicit id
 * grants no access the caller doesn't already have.
 */
export function resolveOrganizationId(
	inputOrganizationId: string | undefined,
	session: { activeOrganizationId?: string | null } | null,
) {
	return inputOrganizationId || activeOrganizationId(session);
}

function vaultScope(userId: string, organizationId: string | null) {
	return and(
		eq(vault.userId, userId),
		organizationId
			? eq(vault.organizationId, organizationId)
			: isNull(vault.organizationId),
	);
}

/**
 * Verify the vault belongs to the current user.
 * Throws NOT_FOUND if the vault doesn't exist or belongs to another user.
 */
async function verifyVaultOwnership(
	db: Db,
	vaultId: string,
	userId: string,
	organizationId: string | null,
	t: TFunction,
) {
	const found = await db.query.vault.findFirst({
		where: and(eq(vault.id, vaultId), vaultScope(userId, organizationId)),
		columns: { id: true },
	});

	if (!found) {
		throw notFoundError(t, "vault");
	}

	return found;
}

/**
 * Non-throwing variant for list endpoints.
 * Returns null instead of throwing when vault is not found.
 */
async function tryVerifyVaultOwnership(
	db: Db,
	vaultId: string,
	userId: string,
	organizationId: string | null,
) {
	const found = await db.query.vault.findFirst({
		where: and(eq(vault.id, vaultId), vaultScope(userId, organizationId)),
		columns: { id: true },
	});
	return found;
}

/**
 * Fetch an item and verify it belongs to one of the user's vaults.
 * Throws NOT_FOUND if the item doesn't exist or isn't accessible.
 */
async function getOwnedItem(
	db: Db,
	itemId: string,
	userId: string,
	organizationId: string | null,
	t: TFunction,
) {
	const found = await db.query.item.findFirst({
		where: eq(item.id, itemId),
		with: { vault: { columns: { userId: true, organizationId: true } } },
	});

	if (
		!found ||
		found.vault.userId !== userId ||
		(found.vault.organizationId ?? null) !== organizationId
	) {
		throw notFoundError(t, "item");
	}

	return found;
}

export const credentialsRouter = createTRPCRouter({
	/**
	 * Create a new encrypted item in a vault.
	 */
	create: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					itemType: z.enum(itemTypeValues),
					...encryptedItemFields,
					organizationId: z.string().optional(),
					idempotencyKey: idempotencyKeyZodSchema,
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await verifyVaultOwnership(
				ctx.db,
				input.vaultId,
				ctx.user.id,
				resolveOrganizationId(input.organizationId, ctx.session),
				ctx.t,
			);

			return runWithIdempotency({
				db: ctx.db,
				userId: ctx.user.id,
				router: "credentials",
				procedure: "create",
				key: input.idempotencyKey,
				executor: async () => {
					const [created] = await ctx.db
						.insert(item)
						.values({
							vaultId: input.vaultId,
							itemType: input.itemType,
							ciphertext: input.ciphertext,
							nonce: input.nonce,
							authTag: input.authTag,
							wrappedDataKey: input.wrappedDataKey,
							wrappedDataKeyNonce: input.wrappedDataKeyNonce,
							wrappedDataKeyAuthTag: input.wrappedDataKeyAuthTag,
						})
						.returning();

					return created;
				},
			});
		}),

	/**
	 * Create multiple encrypted items in a vault (for import).
	 *
	 * Accepts up to 50 ciphertext envelopes per call and inserts them in one
	 * multi-row statement. The input is `.strict()` and carries only
	 * `encryptedItemFields` plus the non-secret item type, so no plaintext
	 * title, username, password, URL, note, or TOTP secret can be submitted.
	 *
	 * `idempotencyKey` is optional and backward compatible: existing callers
	 * that omit it keep the previous behaviour, while a client retrying a
	 * batch it already committed replays the stored `{ created }` response
	 * instead of inserting the batch a second time.
	 */
	batchCreate: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					organizationId: z.string().optional(),
					items: z
						.array(
							// `.strict()` on the item too: without it a caller could
							// attach a plaintext `title`/`password` to an envelope and
							// have it silently accepted rather than rejected.
							z
								.object({
									itemType: z.enum(itemTypeValues),
									...encryptedItemFields,
								})
								.strict(),
						)
						.min(1)
						.max(50),
					idempotencyKey: idempotencyKeyZodSchema,
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await verifyVaultOwnership(
				ctx.db,
				input.vaultId,
				ctx.user.id,
				resolveOrganizationId(input.organizationId, ctx.session),
				ctx.t,
			);

			return runWithIdempotency({
				db: ctx.db,
				userId: ctx.user.id,
				router: "credentials",
				procedure: "batchCreate",
				key: input.idempotencyKey,
				executor: async () => {
					const created = await ctx.db
						.insert(item)
						.values(
							input.items.map((i) => ({
								vaultId: input.vaultId,
								itemType: i.itemType,
								ciphertext: i.ciphertext,
								nonce: i.nonce,
								authTag: i.authTag,
								wrappedDataKey: i.wrappedDataKey,
								wrappedDataKeyNonce: i.wrappedDataKeyNonce,
								wrappedDataKeyAuthTag: i.wrappedDataKeyAuthTag,
							})),
						)
						.returning({ id: item.id });

					return { created: created.length };
				},
			});
		}),

	/**
	 * Get a single item by ID.
	 */
	get: protectedProcedure
		.input(z.object({ itemId: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			const found = await getOwnedItem(
				ctx.db,
				input.itemId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);
			const { vault: _vault, ...result } = found;
			return result;
		}),

	/**
	 * List items with cursor pagination, optional type filter, excluding trashed.
	 *
	 * Ownership of the target vault is verified against the authenticated user.
	 */
	list: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					organizationId: z.string().optional(),
					cursor: z.string().optional(),
					limit: z.number().min(1).max(100).default(50),
					itemType: z.enum(itemTypeValues).optional(),
				})
				.strict(),
		)
		.query(async ({ input, ctx }) => {
			const owned = await tryVerifyVaultOwnership(
				ctx.db,
				input.vaultId,
				ctx.user.id,
				resolveOrganizationId(input.organizationId, ctx.session),
			);
			if (!owned) return { items: [], nextCursor: undefined };

			const conditions = [
				eq(item.vaultId, input.vaultId),
				isNull(item.deletedAt),
			];

			if (input.itemType) {
				conditions.push(eq(item.itemType, input.itemType));
			}

			if (input.cursor) {
				conditions.push(gt(item.id, input.cursor));
			}

			const items = await ctx.db.query.item.findMany({
				where: and(...conditions),
				orderBy: (i, { asc }) => [asc(i.id)],
				limit: input.limit + 1,
			});

			let nextCursor: string | undefined;
			if (items.length > input.limit) {
				const next = items.pop();
				nextCursor = next!.id;
			}

			return { items, nextCursor };
		}),

	/**
	 * Update an item's encrypted blob. Creates a version history entry first.
	 */
	update: protectedProcedure
		.input(
			z
				.object({
					itemId: z.string().min(1),
					...encryptedItemFields,
					idempotencyKey: idempotencyKeyZodSchema,
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			return runWithIdempotency({
				db: ctx.db,
				userId: ctx.user.id,
				router: "credentials",
				procedure: "update",
				key: input.idempotencyKey,
				executor: async () => {
					const existing = await getOwnedItem(
						ctx.db,
						input.itemId,
						ctx.user.id,
						activeOrganizationId(ctx.session),
						ctx.t,
					);

					// Save current state as a version history entry
					await ctx.db.insert(itemVersion).values({
						itemId: existing.id,
						version: existing.version,
						ciphertext: existing.ciphertext,
						nonce: existing.nonce,
						authTag: existing.authTag,
						wrappedDataKey: existing.wrappedDataKey,
						wrappedDataKeyNonce: existing.wrappedDataKeyNonce,
						wrappedDataKeyAuthTag: existing.wrappedDataKeyAuthTag,
					});

					// Update item with new encrypted data and bump version
					const [updated] = await ctx.db
						.update(item)
						.set({
							ciphertext: input.ciphertext,
							nonce: input.nonce,
							authTag: input.authTag,
							wrappedDataKey: input.wrappedDataKey,
							wrappedDataKeyNonce: input.wrappedDataKeyNonce,
							wrappedDataKeyAuthTag: input.wrappedDataKeyAuthTag,
							version: existing.version + 1,
						})
						.where(eq(item.id, input.itemId))
						.returning();

					return updated;
				},
			});
		}),

	/**
	 * Soft delete an item (move to trash).
	 */
	softDelete: protectedProcedure
		.input(
			z
				.object({
					itemId: z.string().min(1),
					idempotencyKey: idempotencyKeyZodSchema,
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			return runWithIdempotency({
				db: ctx.db,
				userId: ctx.user.id,
				router: "credentials",
				procedure: "softDelete",
				key: input.idempotencyKey,
				executor: async () => {
					await getOwnedItem(
						ctx.db,
						input.itemId,
						ctx.user.id,
						activeOrganizationId(ctx.session),
						ctx.t,
					);

					const [updated] = await ctx.db
						.update(item)
						.set({ deletedAt: new Date() })
						.where(eq(item.id, input.itemId))
						.returning();

					return updated;
				},
			});
		}),

	/**
	 * Restore a soft-deleted item from trash.
	 */
	restore: protectedProcedure
		.input(z.object({ itemId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			await getOwnedItem(
				ctx.db,
				input.itemId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);

			const [updated] = await ctx.db
				.update(item)
				.set({ deletedAt: null })
				.where(eq(item.id, input.itemId))
				.returning();

			return updated;
		}),

	/**
	 * Permanently delete an item and all its version history.
	 */
	permanentDelete: protectedProcedure
		.input(z.object({ itemId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			await getOwnedItem(
				ctx.db,
				input.itemId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);

			// Versions cascade-delete via FK, but delete explicitly for clarity
			await ctx.db
				.delete(itemVersion)
				.where(eq(itemVersion.itemId, input.itemId));
			await ctx.db.delete(item).where(eq(item.id, input.itemId));

			return { success: true };
		}),

	/**
	 * List soft-deleted items (trash) with cursor pagination.
	 */
	listTrash: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					cursor: z.string().optional(),
					limit: z.number().min(1).max(100).default(50),
				})
				.strict(),
		)
		.query(async ({ input, ctx }) => {
			const owned = await tryVerifyVaultOwnership(
				ctx.db,
				input.vaultId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
			);
			if (!owned) return { items: [], nextCursor: undefined };

			const conditions = [
				eq(item.vaultId, input.vaultId),
				isNotNull(item.deletedAt),
			];

			if (input.cursor) {
				conditions.push(gt(item.id, input.cursor));
			}

			const items = await ctx.db.query.item.findMany({
				where: and(...conditions),
				orderBy: (i, { desc }) => [desc(i.deletedAt)],
				limit: input.limit + 1,
			});

			let nextCursor: string | undefined;
			if (items.length > input.limit) {
				const next = items.pop();
				nextCursor = next!.id;
			}

			return { items, nextCursor };
		}),

	/**
	 * Permanently delete all trashed items in a vault.
	 */
	emptyTrash: protectedProcedure
		.input(z.object({ vaultId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			await verifyVaultOwnership(
				ctx.db,
				input.vaultId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);

			const trashedItems = await ctx.db.query.item.findMany({
				where: and(eq(item.vaultId, input.vaultId), isNotNull(item.deletedAt)),
				columns: { id: true },
			});

			const ids = trashedItems.map((i) => i.id);

			for (const id of ids) {
				await ctx.db.delete(itemVersion).where(eq(itemVersion.itemId, id));
				await ctx.db.delete(item).where(eq(item.id, id));
			}

			return { deleted: ids.length };
		}),

	/**
	 * Auto-purge items trashed more than 30 days ago.
	 * Returns the count of purged items.
	 */
	autoPurge: protectedProcedure
		.input(z.object({ vaultId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			await verifyVaultOwnership(
				ctx.db,
				input.vaultId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);

			const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

			const expired = await ctx.db.query.item.findMany({
				where: and(
					eq(item.vaultId, input.vaultId),
					isNotNull(item.deletedAt),
					lt(item.deletedAt, cutoff),
				),
				columns: { id: true },
			});

			for (const row of expired) {
				await ctx.db.delete(itemVersion).where(eq(itemVersion.itemId, row.id));
				await ctx.db.delete(item).where(eq(item.id, row.id));
			}

			return { purged: expired.length };
		}),

	/**
	 * Get version history for an item.
	 */
	getVersionHistory: protectedProcedure
		.input(z.object({ itemId: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			await getOwnedItem(
				ctx.db,
				input.itemId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);

			return ctx.db.query.itemVersion.findMany({
				where: eq(itemVersion.itemId, input.itemId),
				orderBy: (v, { desc }) => [desc(v.version)],
			});
		}),

	/**
	 * Toggle the isFavorite flag on an item.
	 */
	toggleFavorite: protectedProcedure
		.input(z.object({ itemId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const existing = await getOwnedItem(
				ctx.db,
				input.itemId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);

			const [updated] = await ctx.db
				.update(item)
				.set({ isFavorite: !existing.isFavorite })
				.where(eq(item.id, input.itemId))
				.returning();

			return updated;
		}),
});
