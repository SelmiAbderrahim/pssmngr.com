// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Device Router Unit Tests
 *
 * Tests device management: register, trust, untrust, list,
 * getPublicKey, remove.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { deviceRouter } from "../../routers/device";

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

function mockInsert(returning: any[] = [{}]) {
	return vi.fn().mockReturnValue({
		values: vi.fn().mockImplementation(() => {
			const p = Promise.resolve(undefined);
			(p as any).returning = vi.fn().mockResolvedValue(returning);
			return p;
		}),
	});
}

function mockUpdate(returning: any[] = [{}]) {
	return vi.fn().mockReturnValue({
		set: vi.fn().mockImplementation(() => ({
			where: vi.fn().mockImplementation(() => {
				const p = Promise.resolve(undefined);
				(p as any).returning = vi.fn().mockResolvedValue(returning);
				return p;
			}),
		})),
	});
}

function mockDelete() {
	return vi.fn().mockReturnValue({
		where: vi.fn().mockResolvedValue(undefined),
	});
}

function makeDevice(overrides: Record<string, any> = {}) {
	return {
		id: "device-1",
		userId: "user-1",
		deviceName: "Chrome Browser",
		deviceType: "browser",
		publicKey: "a".repeat(44),
		trusted: false,
		lastIp: "127.0.0.1",
		lastUserAgent: "Mozilla/5.0",
		lastSeen: new Date(),
		createdAt: new Date(),
		...overrides,
	};
}

function createMockDb() {
	return {
		query: {
			device: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
		},
		insert: mockInsert([makeDevice()]),
		update: mockUpdate([makeDevice()]),
		delete: mockDelete(),
	};
}

function createCtx(userId: string, db: any) {
	return {
		session: { id: `session-${userId}`, activeOrganizationId: "org-1" },
		user: {
			id: userId,
			email: `${userId}@test.com`,
			name: userId,
			role: "member" as const,
			ownerId: "owner-1",
		},
		db,
		language: "en",
		t: ((key: string) => key) as any,
		req: {
			headers: { "user-agent": "Mozilla/5.0" },
			socket: { remoteAddress: "192.168.1.1" },
		},
		res: { setHeader: () => {} },
	};
}

function createCaller(ctx: any) {
	return deviceRouter.createCaller(ctx as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Device Router", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		db = createMockDb();
	});

	// -----------------------------------------------------------------------
	// register
	// -----------------------------------------------------------------------

	describe("register", () => {
		it("creates an untrusted device with metadata", async () => {
			const created = makeDevice({ trusted: false });
			db.insert = mockInsert([created]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.register({
				deviceName: "Chrome Browser",
				deviceType: "browser",
				publicKey: "a".repeat(44),
			});

			expect(result!.trusted).toBe(false);
			expect(result!.deviceName).toBe("Chrome Browser");
			expect(db.insert).toHaveBeenCalled();
		});

		it("rejects unsupported extension and mobile device types", async () => {
			const caller = createCaller(createCtx("user-1", db));
			for (const deviceType of ["extension", "mobile"] as const) {
				await expect(
					caller.register({
						deviceName: `Unsupported ${deviceType}`,
						deviceType: deviceType as any,
						publicKey: "b".repeat(44),
					}),
				).rejects.toMatchObject({ code: "BAD_REQUEST" });
			}
		});

		it("stores escrowed private-key blobs when provided", async () => {
			const valuesSpy = vi.fn().mockImplementation(() => {
				const p = Promise.resolve(undefined);
				(p as any).returning = vi.fn().mockResolvedValue([makeDevice()]);
				return p;
			});
			db.insert = vi.fn().mockReturnValue({ values: valuesSpy });
			const caller = createCaller(createCtx("user-1", db));

			await caller.register({
				deviceName: "Chrome",
				deviceType: "browser",
				publicKey: "a".repeat(44),
				signingPublicKey: "s".repeat(44),
				escrowedPrivateKey: '{"ciphertext":[1],"nonce":[2],"authTag":[3]}',
				escrowedSigningPrivateKey:
					'{"ciphertext":[4],"nonce":[5],"authTag":[6]}',
			});

			expect(valuesSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					encryptedPrivateKey: '{"ciphertext":[1],"nonce":[2],"authTag":[3]}',
					encryptedSigningPrivateKey:
						'{"ciphertext":[4],"nonce":[5],"authTag":[6]}',
				}),
			);
		});
	});

	// -----------------------------------------------------------------------
	// escrow: updateEscrowedKeys / myDevicesWithEscrow
	// -----------------------------------------------------------------------

	describe("updateEscrowedKeys", () => {
		it("updates escrow blobs on the caller's own device", async () => {
			db.query.device.findFirst.mockResolvedValue(
				makeDevice({ id: "device-1", userId: "user-1" }),
			);
			const setSpy = vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			});
			db.update = vi.fn().mockReturnValue({ set: setSpy });

			const caller = createCaller(createCtx("user-1", db));
			const result = await caller.updateEscrowedKeys({
				deviceId: "device-1",
				escrowedPrivateKey: '{"ciphertext":[1],"nonce":[2],"authTag":[3]}',
			});

			expect(result).toEqual({ success: true });
			expect(setSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					encryptedPrivateKey: '{"ciphertext":[1],"nonce":[2],"authTag":[3]}',
				}),
			);
		});

		it("throws NOT_FOUND for another user's device", async () => {
			// ownership is part of the query: a foreign device yields no row
			db.query.device.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("user-1", db));
			await expect(
				caller.updateEscrowedKeys({
					deviceId: "device-of-someone-else",
					escrowedPrivateKey: "{}",
				}),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	describe("myDevicesWithEscrow", () => {
		it("returns the caller's devices with escrow blobs", async () => {
			db.query.device.findMany.mockResolvedValue([
				{
					id: "device-1",
					deviceName: "Chrome",
					deviceType: "browser",
					publicKey: "pk",
					signingPublicKey: "spk",
					encryptedPrivateKey: '{"ciphertext":[1]}',
					encryptedSigningPrivateKey: null,
					trusted: false,
					lastSeen: new Date(),
				},
			]);

			const caller = createCaller(createCtx("user-1", db));
			const result = await caller.myDevicesWithEscrow();

			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				id: "device-1",
				escrowedPrivateKey: '{"ciphertext":[1]}',
				escrowedSigningPrivateKey: null,
			});
			// scoping is enforced by the query itself (userId = caller)
			expect(db.query.device.findMany).toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// trust
	// -----------------------------------------------------------------------

	describe("trust", () => {
		it("marks device as trusted for owner", async () => {
			db.query.device.findFirst.mockResolvedValue(
				makeDevice({ id: "device-1", userId: "user-1" }),
			);
			db.update = mockUpdate([makeDevice({ trusted: true })]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.trust({ deviceId: "device-1" });

			expect(result!.trusted).toBe(true);
		});

		it("throws NOT_FOUND for non-owner device", async () => {
			db.query.device.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-2", db));

			await expect(caller.trust({ deviceId: "device-1" })).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});
	});

	// -----------------------------------------------------------------------
	// untrust
	// -----------------------------------------------------------------------

	describe("untrust", () => {
		it("revokes trust from device", async () => {
			db.query.device.findFirst.mockResolvedValue(
				makeDevice({ id: "device-1", userId: "user-1", trusted: true }),
			);
			db.update = mockUpdate([makeDevice({ trusted: false })]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.untrust({ deviceId: "device-1" });

			expect(result!.trusted).toBe(false);
		});

		it("throws NOT_FOUND for non-owner device", async () => {
			db.query.device.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-2", db));

			await expect(caller.untrust({ deviceId: "device-1" })).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});
	});

	// -----------------------------------------------------------------------
	// list
	// -----------------------------------------------------------------------

	describe("list", () => {
		it("returns all devices for current user", async () => {
			const devices = [
				makeDevice({ id: "d-1", deviceName: "Chrome" }),
				makeDevice({ id: "d-2", deviceName: "Firefox" }),
			];
			db.query.device.findMany.mockResolvedValue(devices);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.list();

			expect(result).toHaveLength(2);
		});

		it("returns empty array when no devices", async () => {
			db.query.device.findMany.mockResolvedValue([]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.list();

			expect(result).toEqual([]);
		});
	});

	// -----------------------------------------------------------------------
	// getPublicKey
	// -----------------------------------------------------------------------

	describe("getPublicKey", () => {
		it("returns public key from trusted device, even with extra untrusted devices", async () => {
			// Trusted first (ordering desc(trusted), desc(lastSeen)), plus a
			// later-seen untrusted device that must NOT win.
			db.query.device.findMany.mockResolvedValue([
				{
					id: "device-1",
					publicKey: "pubkey-trusted",
					signingPublicKey: null,
					deviceName: "Trusted Chrome",
					trusted: true,
				},
				{
					id: "device-attacker",
					publicKey: "pubkey-attacker",
					signingPublicKey: null,
					deviceName: "Planted Device",
					trusted: false,
				},
			]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.getPublicKey({ userId: "user-2" });

			expect(result.publicKey).toBe("pubkey-trusted");
			expect(result.trusted).toBe(true);
			expect(result.deviceId).toBe("device-1");
		});

		it("falls back to a single untrusted device (unambiguous)", async () => {
			db.query.device.findMany.mockResolvedValue([
				{
					id: "device-2",
					publicKey: "pubkey-untrusted",
					signingPublicKey: null,
					deviceName: "Untrusted Device",
					trusted: false,
				},
			]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.getPublicKey({ userId: "user-2" });

			expect(result.publicKey).toBe("pubkey-untrusted");
			expect(result.trusted).toBe(false);
		});

		it("refuses to guess when there are multiple devices and none is trusted (fix #25)", async () => {
			// Recency-hijack scenario: a planted device must not be silently
			// preferred over the victim's own device.
			db.query.device.findMany.mockResolvedValue([
				{
					id: "device-attacker",
					publicKey: "pubkey-attacker",
					signingPublicKey: null,
					deviceName: "Planted Device",
					trusted: false,
				},
				{
					id: "device-victim",
					publicKey: "pubkey-victim",
					signingPublicKey: null,
					deviceName: "Victim Laptop",
					trusted: false,
				},
			]);
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.getPublicKey({ userId: "user-2" })).rejects.toThrow(
				expect.objectContaining({ code: "PRECONDITION_FAILED" }),
			);
		});

		it("returns the most-recent device for a self-lookup even when none is trusted", async () => {
			// Self-lookups carry no recency-hijack risk (you wrap to your own
			// device and decrypt it yourself), so fix #25's refusal is bypassed.
			db.query.device.findMany.mockResolvedValue([
				{
					id: "device-recent",
					publicKey: "pubkey-recent",
					signingPublicKey: null,
					deviceName: "This Browser",
					trusted: false,
				},
				{
					id: "device-older",
					publicKey: "pubkey-older",
					signingPublicKey: null,
					deviceName: "Old Browser",
					trusted: false,
				},
			]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.getPublicKey({ userId: "user-1" });

			expect(result.deviceId).toBe("device-recent");
			expect(result.publicKey).toBe("pubkey-recent");
		});

		it("throws NOT_FOUND when no device exists", async () => {
			db.query.device.findMany.mockResolvedValue([]);
			const caller = createCaller(createCtx("user-1", db));

			await expect(
				caller.getPublicKey({ userId: "user-no-device" }),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	describe("remove", () => {
		it("deletes device for owner", async () => {
			db.query.device.findFirst.mockResolvedValue(
				makeDevice({ id: "device-1", userId: "user-1" }),
			);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.remove({ deviceId: "device-1" });

			expect(result.success).toBe(true);
			expect(db.delete).toHaveBeenCalled();
		});

		it("throws NOT_FOUND for non-owner device", async () => {
			db.query.device.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-2", db));

			await expect(caller.remove({ deviceId: "device-1" })).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});

		it("throws NOT_FOUND for nonexistent device", async () => {
			db.query.device.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.remove({ deviceId: "no-device" })).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});
	});

	// -----------------------------------------------------------------------
	// revoke (M2) — dashboard "Revoke" action; deletes the device row (and the
	// stored wrapped key with it), scoped to the caller.
	// -----------------------------------------------------------------------

	describe("revoke", () => {
		it("deletes the device for the owner (dropping any wrapped key)", async () => {
			db.query.device.findFirst.mockResolvedValue(
				makeDevice({
					id: "device-1",
					userId: "user-1",
					wrappedSecretKey: "{}",
					wrappedSecretKeySenderKey: "k",
				}),
			);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.revoke({ deviceId: "device-1" });

			expect(result.success).toBe(true);
			expect(db.delete).toHaveBeenCalled();
		});

		it("throws NOT_FOUND for a non-owner device", async () => {
			db.query.device.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-2", db));

			await expect(caller.revoke({ deviceId: "device-1" })).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});
	});

	// -----------------------------------------------------------------------
	// Persistent-unlock expiry (0158) — zero-knowledge, timestamps only.
	// -----------------------------------------------------------------------

	describe("setPersistentUnlockExpiry", () => {
		it("updates the caller's own device with a timestamp", async () => {
			const own = makeDevice({ id: "device-1", userId: "user-1" });
			db.query.device.findFirst = vi.fn().mockResolvedValue(own);
			const setSpy = vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			});
			db.update = vi.fn().mockReturnValue({ set: setSpy });

			const caller = createCaller(createCtx("user-1", db));
			const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
			const res = await caller.setPersistentUnlockExpiry({
				deviceId: "device-1",
				expiresAt: exp,
			});

			expect(res).toEqual({ success: true });
			expect(setSpy).toHaveBeenCalledWith({ persistentUnlockExpiresAt: exp });
		});

		it("throws NOT_FOUND for another user's device (ownership check)", async () => {
			db.query.device.findFirst = vi.fn().mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			await expect(
				caller.setPersistentUnlockExpiry({
					deviceId: "someone-elses",
					expiresAt: new Date(),
				}),
			).rejects.toThrow();
		});

		it("accepts null to revoke", async () => {
			db.query.device.findFirst = vi
				.fn()
				.mockResolvedValue(makeDevice({ id: "device-1", userId: "user-1" }));
			const setSpy = vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			});
			db.update = vi.fn().mockReturnValue({ set: setSpy });

			const caller = createCaller(createCtx("user-1", db));
			await caller.setPersistentUnlockExpiry({
				deviceId: "device-1",
				expiresAt: null,
			});
			expect(setSpy).toHaveBeenCalledWith({ persistentUnlockExpiresAt: null });
		});
	});

	describe("revokeAllPersistentUnlocks", () => {
		it("nulls the expiry across every device the caller owns", async () => {
			const setSpy = vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			});
			db.update = vi.fn().mockReturnValue({ set: setSpy });

			const caller = createCaller(createCtx("user-1", db));
			const res = await caller.revokeAllPersistentUnlocks();
			expect(res).toEqual({ success: true });
			expect(setSpy).toHaveBeenCalledWith({ persistentUnlockExpiresAt: null });
		});
	});

	describe("getPersistentUnlockExpiry", () => {
		it("returns the expiry for the caller's own device", async () => {
			const exp = new Date();
			db.query.device.findFirst = vi
				.fn()
				.mockResolvedValue({ persistentUnlockExpiresAt: exp });
			const caller = createCaller(createCtx("user-1", db));
			const res = await caller.getPersistentUnlockExpiry({
				deviceId: "device-1",
			});
			expect(res).toEqual({ expiresAt: exp });
		});

		it("throws NOT_FOUND for another user's device", async () => {
			db.query.device.findFirst = vi.fn().mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));
			await expect(
				caller.getPersistentUnlockExpiry({ deviceId: "not-mine" }),
			).rejects.toThrow();
		});
	});
});
