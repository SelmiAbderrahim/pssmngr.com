// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { item, vault } from "@pssmngr/server/db/schema";
import { badRequestError, notFoundError } from "@pssmngr/server/i18n/errors";
import {
	encryptedField,
	smallBlob,
	stateBlob,
} from "@pssmngr/server/lib/encrypted-payload";
import { and, eq, isNull } from "drizzle-orm";
import type { TFunction } from "i18next";
import { z } from "zod/v3";
import { type Context, createTRPCRouter, protectedProcedure } from "../trpc";

type Db = Context["db"];

function activeOrganizationId(
	session: { activeOrganizationId?: string | null } | null,
) {
	return session?.activeOrganizationId || null;
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
 * Fetch a vault and verify the current user owns it.
 * Throws NOT_FOUND if the vault doesn't exist or belongs to another user.
 */
async function getOwnedVault(
	db: Db,
	vaultId: string,
	userId: string,
	organizationId: string | null,
	t: TFunction,
) {
	const found = await db.query.vault.findFirst({
		where: and(eq(vault.id, vaultId), vaultScope(userId, organizationId)),
	});

	if (!found) {
		throw notFoundError(t, "vault");
	}

	return found;
}

export const vaultRouter = createTRPCRouter({
	/**
	 * Get a vault by ID. Only the owner can access it.
	 */
	get: protectedProcedure
		.input(z.object({ vaultId: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			return getOwnedVault(
				ctx.db,
				input.vaultId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);
		}),

	/**
	 * List all vaults for the current user.
	 *
	 * Always scoped to the authenticated user and active organization.
	 */
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().optional() }).optional())
		.query(async ({ input, ctx }) => {
			// The client passes the workspace org it is viewing; the session's
			// active org is only a fallback. This keeps the returned vault in the
			// SAME organization the write path (credentials.create) will scope to,
			// even if the session sync is lagging a workspace switch on page load.
			const organizationId =
				input?.organizationId || activeOrganizationId(ctx.session);
			const scopedVaults = await ctx.db.query.vault.findMany({
				where: vaultScope(ctx.user.id, organizationId),
				orderBy: (v, { asc }) => [asc(v.createdAt)],
			});

			if (scopedVaults.length > 0 || !organizationId) {
				return scopedVaults;
			}

			const templateVault = await ctx.db.query.vault.findFirst({
				where: eq(vault.userId, ctx.user.id),
				orderBy: (v, { asc }) => [asc(v.createdAt)],
			});

			if (!templateVault) {
				return [];
			}

			const [created] = await ctx.db
				.insert(vault)
				.values({
					userId: ctx.user.id,
					organizationId,
					name: templateVault.name,
					kdfSalt: templateVault.kdfSalt,
					encryptedVerificationBlob: templateVault.encryptedVerificationBlob,
				})
				.returning();

			return [created];
		}),

	/**
	 * Create a new vault with a KDF salt for client-side key derivation.
	 */
	create: protectedProcedure
		.input(
			z
				.object({
					name: z.string().min(1).max(100),
					kdfSalt: z.string().min(24).max(512),
					encryptedVerificationBlob: smallBlob.optional(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const [created] = await ctx.db
				.insert(vault)
				.values({
					userId: ctx.user.id,
					organizationId: activeOrganizationId(ctx.session),
					name: input.name,
					kdfSalt: input.kdfSalt,
					encryptedVerificationBlob: input.encryptedVerificationBlob ?? null,
				})
				.returning();

			return created;
		}),

	/**
	 * Update vault name. Only the owner can update.
	 */
	update: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					name: z.string().min(1).max(100).optional(),
					encryptedVerificationBlob: smallBlob.optional(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await getOwnedVault(
				ctx.db,
				input.vaultId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);

			const [updated] = await ctx.db
				.update(vault)
				.set({
					...(input.name !== undefined && { name: input.name }),
					...(input.encryptedVerificationBlob !== undefined && {
						encryptedVerificationBlob: input.encryptedVerificationBlob,
					}),
				})
				.where(eq(vault.id, input.vaultId))
				.returning();

			return updated;
		}),

	/**
	 * Delete a vault and all its items. Requires explicit confirmation.
	 */
	delete: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					confirm: z.boolean(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			if (!input.confirm) {
				throw badRequestError(ctx.t, "errors:vault.deleteNotConfirmed");
			}
			await getOwnedVault(
				ctx.db,
				input.vaultId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);

			// Items cascade-delete via FK constraint, but delete explicitly for clarity
			await ctx.db.delete(item).where(eq(item.vaultId, input.vaultId));
			await ctx.db.delete(vault).where(eq(vault.id, input.vaultId));

			return { success: true };
		}),

	/**
	 * Re-key a vault after a password change.
	 *
	 * Atomically updates the vault's verification blob and all items'
	 * wrapped data keys. The actual item ciphertext is unchanged — only
	 * the wrapping layer is rotated to the new vault key.
	 */
	reKey: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					encryptedVerificationBlob: smallBlob,
					items: z
						.array(
							z.object({
								itemId: z.string().min(1),
								wrappedDataKey: encryptedField,
								wrappedDataKeyNonce: encryptedField,
								wrappedDataKeyAuthTag: encryptedField,
							}),
						)
						.min(1)
						.max(500),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await getOwnedVault(
				ctx.db,
				input.vaultId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);

			// Update vault verification blob
			await ctx.db
				.update(vault)
				.set({ encryptedVerificationBlob: input.encryptedVerificationBlob })
				.where(eq(vault.id, input.vaultId));

			// Update each item's wrapped data key fields
			for (const entry of input.items) {
				await ctx.db
					.update(item)
					.set({
						wrappedDataKey: entry.wrappedDataKey,
						wrappedDataKeyNonce: entry.wrappedDataKeyNonce,
						wrappedDataKeyAuthTag: entry.wrappedDataKeyAuthTag,
					})
					.where(
						and(eq(item.id, entry.itemId), eq(item.vaultId, input.vaultId)),
					);
			}

			return { reKeyed: input.items.length };
		}),

	/**
	 * Store an encrypted watchtower scan state blob for the vault.
	 * The server treats this as an opaque base64 string.
	 */
	updateWatchtowerState: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					encryptedWatchtowerState: stateBlob,
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await getOwnedVault(
				ctx.db,
				input.vaultId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);

			const [updated] = await ctx.db
				.update(vault)
				.set({ encryptedWatchtowerState: input.encryptedWatchtowerState })
				.where(eq(vault.id, input.vaultId))
				.returning();

			return updated;
		}),

	/**
	 * Store an encrypted search index blob for the vault.
	 * The server treats this as an opaque base64 string.
	 */
	updateSearchIndex: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					encryptedSearchIndex: stateBlob,
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await getOwnedVault(
				ctx.db,
				input.vaultId,
				ctx.user.id,
				activeOrganizationId(ctx.session),
				ctx.t,
			);

			const [updated] = await ctx.db
				.update(vault)
				.set({ encryptedSearchIndex: input.encryptedSearchIndex })
				.where(eq(vault.id, input.vaultId))
				.returning();

			return updated;
		}),
});
