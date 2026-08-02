// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { device } from "@pssmngr/server/db/schema";
import { notFoundError } from "@pssmngr/server/i18n/errors";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v3";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const deviceRouter = createTRPCRouter({
	/**
	 * Register a new device with its X25519 public key.
	 * Devices start untrusted and must be explicitly trusted.
	 */
	register: protectedProcedure
		.input(
			z
				.object({
					deviceName: z.string().min(1).max(100),
					deviceType: z.literal("browser"),
					publicKey: z.string().min(32).max(512),
					signingPublicKey: z.string().min(32).max(512).optional(),
					// Vault-key-encrypted private-key escrow blobs (opaque JSON,
					// produced client-side — see schema/device.ts).
					escrowedPrivateKey: z.string().min(1).max(4096).optional(),
					escrowedSigningPrivateKey: z.string().min(1).max(4096).optional(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const [created] = await ctx.db
				.insert(device)
				.values({
					userId: ctx.user.id,
					deviceName: input.deviceName,
					deviceType: input.deviceType,
					publicKey: input.publicKey,
					signingPublicKey: input.signingPublicKey ?? null,
					encryptedPrivateKey: input.escrowedPrivateKey ?? null,
					encryptedSigningPrivateKey: input.escrowedSigningPrivateKey ?? null,
					trusted: false,
					lastIp: ctx.req?.socket?.remoteAddress ?? null,
					lastUserAgent: ctx.req?.headers?.["user-agent"] ?? null,
					lastSeen: new Date(),
				})
				.returning();

			return created;
		}),

	/**
	 * Attach (or update) the Ed25519 signing public key on an existing device.
	 * Lazily upgrades devices enrolled before signing keys existed so they can
	 * sign share envelopes for shared-vault key wrapping.
	 */
	updateSigningKey: protectedProcedure
		.input(
			z
				.object({
					deviceId: z.string().min(1),
					signingPublicKey: z.string().min(32).max(512),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const dev = await ctx.db.query.device.findFirst({
				where: and(
					eq(device.id, input.deviceId),
					eq(device.userId, ctx.user.id),
				),
			});

			if (!dev) {
				throw notFoundError(ctx.t, "device");
			}

			const [updated] = await ctx.db
				.update(device)
				.set({
					signingPublicKey: input.signingPublicKey,
					lastSeen: new Date(),
				})
				.where(eq(device.id, input.deviceId))
				.returning();

			return updated
				? { ...updated, signingPublicKey: input.signingPublicKey }
				: null;
		}),

	/**
	 * Store (or refresh) this device's vault-key-encrypted private-key escrow
	 * blobs. Backfills devices enrolled before escrow existed. The blobs are
	 * opaque client-produced ciphertext; the server never decrypts them.
	 */
	updateEscrowedKeys: protectedProcedure
		.input(
			z
				.object({
					deviceId: z.string().min(1),
					escrowedPrivateKey: z.string().min(1).max(4096),
					escrowedSigningPrivateKey: z.string().min(1).max(4096).optional(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const dev = await ctx.db.query.device.findFirst({
				where: and(
					eq(device.id, input.deviceId),
					eq(device.userId, ctx.user.id),
				),
			});

			if (!dev) {
				throw notFoundError(ctx.t, "device");
			}

			await ctx.db
				.update(device)
				.set({
					encryptedPrivateKey: input.escrowedPrivateKey,
					encryptedSigningPrivateKey: input.escrowedSigningPrivateKey ?? null,
					lastSeen: new Date(),
				})
				.where(eq(device.id, input.deviceId));

			return { success: true };
		}),

	/**
	 * List the caller's own devices including their escrow blobs, so a browser
	 * that lost IndexedDB can recover a device identity after unlocking the
	 * vault. The blobs are only decryptable with the caller's vault key.
	 */
	myDevicesWithEscrow: protectedProcedure.query(async ({ ctx }) => {
		const devices = await ctx.db.query.device.findMany({
			where: eq(device.userId, ctx.user.id),
			columns: {
				id: true,
				deviceName: true,
				deviceType: true,
				publicKey: true,
				signingPublicKey: true,
				encryptedPrivateKey: true,
				encryptedSigningPrivateKey: true,
				trusted: true,
				lastSeen: true,
			},
			orderBy: (d, { desc }) => [desc(d.lastSeen)],
		});

		return devices.map((d) => ({
			id: d.id,
			deviceName: d.deviceName,
			deviceType: d.deviceType,
			publicKey: d.publicKey,
			signingPublicKey: d.signingPublicKey,
			escrowedPrivateKey: d.encryptedPrivateKey,
			escrowedSigningPrivateKey: d.encryptedSigningPrivateKey,
			trusted: d.trusted,
			lastSeen: d.lastSeen,
		}));
	}),

	/**
	 * Mark a device as trusted. Only the device owner can trust it.
	 */
	trust: protectedProcedure
		.input(z.object({ deviceId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const dev = await ctx.db.query.device.findFirst({
				where: and(
					eq(device.id, input.deviceId),
					eq(device.userId, ctx.user.id),
				),
			});

			if (!dev) {
				throw notFoundError(ctx.t, "device");
			}

			const [updated] = await ctx.db
				.update(device)
				.set({ trusted: true })
				.where(eq(device.id, input.deviceId))
				.returning();

			return updated;
		}),

	/**
	 * Revoke trust from a device.
	 */
	untrust: protectedProcedure
		.input(z.object({ deviceId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const dev = await ctx.db.query.device.findFirst({
				where: and(
					eq(device.id, input.deviceId),
					eq(device.userId, ctx.user.id),
				),
			});

			if (!dev) {
				throw notFoundError(ctx.t, "device");
			}

			const [updated] = await ctx.db
				.update(device)
				.set({ trusted: false })
				.where(eq(device.id, input.deviceId))
				.returning();

			return updated;
		}),

	/**
	 * List all devices for the current user.
	 */
	list: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.device.findMany({
			where: eq(device.userId, ctx.user.id),
			orderBy: (d, { desc }) => [desc(d.lastSeen)],
			columns: {
				id: true,
				userId: true,
				deviceName: true,
				deviceType: true,
				publicKey: true,
				signingPublicKey: true,
				trusted: true,
				lastIp: true,
				lastUserAgent: true,
				lastSeen: true,
				createdAt: true,
			},
		});
	}),

	/**
	 * Fetch a user's active device public key by userId.
	 *
	 * Used in the sharing/escrow flows so the sender can wrap the data key to the
	 * recipient's device.
	 *
	 * SECURITY (Round 4, fix #25): selecting the recipient device by recency is a
	 * key-substitution vector. An attacker who plants an extra (untrusted) device
	 * on a victim that has no trusted device would, under a plain
	 * `desc(trusted), desc(lastSeen)` pick, become the "most recent" device and
	 * receive everything wrapped to them. We therefore:
	 *   - always prefer a trusted device when one exists; and
	 *   - fall back to an untrusted device ONLY when it is the user's sole
	 *     device (no ambiguity, so no recency-hijack). If the user has several
	 *     devices and none is trusted, we refuse and require them to trust one
	 *     first rather than silently guessing.
	 */
	getPublicKey: protectedProcedure
		.input(z.object({ userId: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			const devices = await ctx.db.query.device.findMany({
				where: eq(device.userId, input.userId),
				orderBy: (d, { desc }) => [desc(d.trusted), desc(d.lastSeen)],
				columns: {
					id: true,
					publicKey: true,
					signingPublicKey: true,
					deviceName: true,
					trusted: true,
				},
			});

			if (devices.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:device.noDeviceForUser"),
				});
			}

			const trusted = devices.filter((d) => d.trusted);
			const isSelf = input.userId === ctx.user.id;
			let dev: (typeof devices)[number];
			if (trusted.length > 0) {
				// At least one trusted device → use the most-recently-seen trusted one.
				dev = trusted[0]!;
			} else if (devices.length === 1) {
				// Single untrusted device: unambiguous, safe to wrap to it.
				dev = devices[0]!;
			} else if (isSelf) {
				// Self-lookup: fix #25's recency-hijack threat does not apply — you
				// wrap to your own device and decrypt it yourself, and an extra
				// device on your own account already implies account compromise.
				// Return the most-recent device instead of refusing.
				dev = devices[0]!;
			} else {
				// Multiple devices, none trusted → ambiguous and hijack-prone.
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: ctx.t("errors:device.noTrustedDevice"),
				});
			}

			return {
				deviceId: dev.id,
				publicKey: dev.publicKey,
				signingPublicKey: dev.signingPublicKey,
				deviceName: dev.deviceName,
				trusted: dev.trusted,
			};
		}),

	/**
	 * Remove a device. Only the device owner can remove it.
	 */
	remove: protectedProcedure
		.input(z.object({ deviceId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const dev = await ctx.db.query.device.findFirst({
				where: and(
					eq(device.id, input.deviceId),
					eq(device.userId, ctx.user.id),
				),
			});

			if (!dev) {
				throw notFoundError(ctx.t, "device");
			}

			await ctx.db.delete(device).where(eq(device.id, input.deviceId));

			return { success: true };
		}),

	/**
	 * Revoke a device (dashboard "Revoke" action). Functionally identical to
	 * `remove`: deletes the device row scoped to the calling user, which also
	 * drops any stored wrapped Secret Key (the row is gone). Kept as a distinct
	 * named procedure because the dashboard UI calls `device.revoke`.
	 *
	 * The full row delete implicitly nulls persistent_unlock_expires_at along
	 * with everything else — nothing extra to do here.
	 */
	revoke: protectedProcedure
		.input(z.object({ deviceId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const dev = await ctx.db.query.device.findFirst({
				where: and(
					eq(device.id, input.deviceId),
					eq(device.userId, ctx.user.id),
				),
			});

			if (!dev) {
				throw notFoundError(ctx.t, "device");
			}

			await ctx.db.delete(device).where(eq(device.id, input.deviceId));

			return { success: true };
		}),

	/**
	 * Set (or clear) the persistent-unlock expiry timestamp for the caller's
	 * own device. Zero-knowledge: the server only ever sees a device id and
	 * a timestamp — no key material, no wrap, no ciphertext. Pass
	 * `expiresAt: null` to revoke.
	 *
	 * Ownership is enforced: the target device MUST belong to the caller.
	 */
	setPersistentUnlockExpiry: protectedProcedure
		.input(
			z
				.object({
					deviceId: z.string().min(1),
					expiresAt: z.date().nullable(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const dev = await ctx.db.query.device.findFirst({
				where: and(
					eq(device.id, input.deviceId),
					eq(device.userId, ctx.user.id),
				),
			});

			if (!dev) {
				throw notFoundError(ctx.t, "device");
			}

			await ctx.db
				.update(device)
				.set({ persistentUnlockExpiresAt: input.expiresAt })
				.where(eq(device.id, input.deviceId));

			return { success: true };
		}),

	/**
	 * Revoke persistent-unlock across every trusted device the caller owns
	 * WITHOUT deleting the device rows themselves. Useful for "log everyone
	 * out" without losing browser enrollment or trust state.
	 */
	revokeAllPersistentUnlocks: protectedProcedure.mutation(async ({ ctx }) => {
		await ctx.db
			.update(device)
			.set({ persistentUnlockExpiresAt: null })
			.where(eq(device.userId, ctx.user.id));
		return { success: true };
	}),

	/**
	 * Read the persistent-unlock expiry timestamp for the caller's own device.
	 * Used at bootstrap to decide whether to trust a locally-persisted wrap.
	 */
	getPersistentUnlockExpiry: protectedProcedure
		.input(z.object({ deviceId: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			const dev = await ctx.db.query.device.findFirst({
				where: and(
					eq(device.id, input.deviceId),
					eq(device.userId, ctx.user.id),
				),
				columns: { persistentUnlockExpiresAt: true },
			});
			if (!dev) throw notFoundError(ctx.t, "device");
			return { expiresAt: dev.persistentUnlockExpiresAt };
		}),
});
