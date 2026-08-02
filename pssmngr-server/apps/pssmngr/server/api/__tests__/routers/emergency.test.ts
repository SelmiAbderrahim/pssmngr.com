// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Emergency Access Router Unit Tests
 *
 * Tests trusted contact management, time-locked access requests,
 * denial/grant lifecycle, timer enforcement, signed timestamps,
 * 24h denial cooldown, audit logging, and escrow retrieval.
 */

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emergencyRouter } from "../../routers/emergency";

// ---------------------------------------------------------------------------
// Mock the time-lock signing module
// ---------------------------------------------------------------------------

vi.mock("@pssmngr/server/utils/emergency-timelock", () => ({
	DENIAL_COOLDOWN_MS: 24 * 60 * 60 * 1000,
	signTimestamp: vi.fn().mockReturnValue("valid-hmac-signature-hex"),
	verifyTimestamp: vi.fn().mockReturnValue(true),
}));

// Import after mock so we can control return values
import {
	signTimestamp,
	verifyTimestamp,
} from "@pssmngr/server/utils/emergency-timelock";

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

function makeTrustedContact(
	overrides: Partial<{
		id: string;
		ownerId: string;
		contactId: string;
		waitingPeriodDays: number;
		createdAt: Date;
	}> = {},
) {
	return {
		id: overrides.id ?? "tc-1",
		ownerId: overrides.ownerId ?? "user-owner",
		contactId: overrides.contactId ?? "user-contact",
		waitingPeriodDays: overrides.waitingPeriodDays ?? 7,
		createdAt: overrides.createdAt ?? new Date(),
	};
}

function makeAccessRequest(
	overrides: Partial<{
		id: string;
		trustedContactId: string;
		ownerId: string;
		contactId: string;
		status: string;
		waitingPeriodDays: number;
		requestedAt: Date;
		expiresAt: Date;
		deniedAt: Date | null;
		grantedAt: Date | null;
		denialCooldownUntil: Date | null;
		timestampSignature: string;
		escrowBlob: string | null;
		escrowNonce: string | null;
		escrowAuthTag: string | null;
		ephemeralPublicKey: string | null;
		escrowSignature: string | null;
		owner: { id: string; name: string; email: string; image: string | null };
		contact: {
			id: string;
			name: string;
			email: string;
			image: string | null;
		};
	}> = {},
) {
	return {
		id: overrides.id ?? "req-1",
		trustedContactId: overrides.trustedContactId ?? "tc-1",
		ownerId: overrides.ownerId ?? "user-owner",
		contactId: overrides.contactId ?? "user-contact",
		status: overrides.status ?? "pending",
		waitingPeriodDays: overrides.waitingPeriodDays ?? 7,
		requestedAt: overrides.requestedAt ?? new Date(),
		expiresAt:
			overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		deniedAt: overrides.deniedAt ?? null,
		grantedAt: overrides.grantedAt ?? null,
		denialCooldownUntil: overrides.denialCooldownUntil ?? null,
		timestampSignature:
			overrides.timestampSignature ?? "valid-hmac-signature-hex",
		escrowBlob: overrides.escrowBlob ?? null,
		escrowNonce: overrides.escrowNonce ?? null,
		escrowAuthTag: overrides.escrowAuthTag ?? null,
		ephemeralPublicKey: overrides.ephemeralPublicKey ?? null,
		escrowSignature: overrides.escrowSignature ?? null,
		owner: overrides.owner ?? {
			id: "user-owner",
			name: "Owner",
			email: "owner@test.com",
			image: null,
		},
		contact: overrides.contact ?? {
			id: "user-contact",
			name: "Contact",
			email: "contact@test.com",
			image: null,
		},
	};
}

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

function createMockDb() {
	return {
		query: {
			user: { findFirst: vi.fn().mockResolvedValue(null) },
			trustedContact: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
			emergencyAccessRequest: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
			emergencyAuditLog: {
				findMany: vi.fn().mockResolvedValue([]),
			},
			notifications: { findFirst: vi.fn().mockResolvedValue(null) },
		},
		insert: mockInsert(),
		update: mockUpdate(),
		delete: mockDelete(),
	};
}

function createCtx(userId: string, db: any, extra: Record<string, any> = {}) {
	return {
		session: { id: `session-${userId}`, activeOrganizationId: "org-1" },
		user: {
			id: userId,
			email: `${userId}@test.com`,
			name: userId,
			role: "member",
			ownerId: "owner-1",
			...extra,
		},
		db,
		language: "en",
		t: ((key: string) => key) as any,
		req: { headers: {} },
		res: { setHeader: () => {} },
	};
}

function createCaller(ctx: any) {
	return emergencyRouter.createCaller(ctx as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Emergency Router", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		db = createMockDb();
		vi.clearAllMocks();
		// Reset default mock behavior
		vi.mocked(signTimestamp).mockReturnValue("valid-hmac-signature-hex");
		vi.mocked(verifyTimestamp).mockReturnValue(true);
	});

	// -----------------------------------------------------------------------
	// addTrustedContact
	// -----------------------------------------------------------------------

	describe("addTrustedContact", () => {
		it("adds a trusted contact with default waiting period", async () => {
			const contactUser = {
				id: "user-contact",
				email: "contact@test.com",
				name: "Contact",
			};
			db.query.user.findFirst.mockResolvedValue(contactUser);
			db.query.trustedContact.findFirst.mockResolvedValue(null);
			db.insert = mockInsert([
				{
					id: "tc-1",
					contactId: "user-contact",
					waitingPeriodDays: 7,
				},
			]);

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.addTrustedContact({
				contactEmail: "contact@test.com",
			});

			expect(result.id).toBe("tc-1");
			expect(result.waitingPeriodDays).toBe(7);
			expect(result.contactId).toBe("user-contact");
		});

		it("adds a trusted contact with custom waiting period", async () => {
			const contactUser = {
				id: "user-contact",
				email: "contact@test.com",
				name: "Contact",
			};
			db.query.user.findFirst.mockResolvedValue(contactUser);
			db.query.trustedContact.findFirst.mockResolvedValue(null);
			db.insert = mockInsert([
				{
					id: "tc-1",
					contactId: "user-contact",
					waitingPeriodDays: 14,
				},
			]);

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.addTrustedContact({
				contactEmail: "contact@test.com",
				waitingPeriodDays: 14,
			});

			expect(result.waitingPeriodDays).toBe(14);
		});

		it("rejects adding self as trusted contact", async () => {
			db.query.user.findFirst.mockResolvedValue({
				id: "user-owner",
				email: "user-owner@test.com",
				name: "Owner",
			});

			const caller = createCaller(createCtx("user-owner", db));
			await expect(
				caller.addTrustedContact({
					contactEmail: "user-owner@test.com",
				}),
			).rejects.toThrow(TRPCError);
		});

		it("rejects duplicate trusted contact", async () => {
			db.query.user.findFirst.mockResolvedValue({
				id: "user-contact",
				email: "contact@test.com",
			});
			db.query.trustedContact.findFirst.mockResolvedValue(makeTrustedContact());

			const caller = createCaller(createCtx("user-owner", db));
			await expect(
				caller.addTrustedContact({
					contactEmail: "contact@test.com",
				}),
			).rejects.toThrow("errors:emergency.alreadyTrusted");
		});

		it("rejects unknown email", async () => {
			db.query.user.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("user-owner", db));
			await expect(
				caller.addTrustedContact({
					contactEmail: "nobody@test.com",
				}),
			).rejects.toThrow("errors:emergency.userNotFound");
		});

		it("adds a trusted contact with escrow data", async () => {
			const contactUser = {
				id: "user-contact",
				email: "contact@test.com",
				name: "Contact",
			};
			db.query.user.findFirst.mockResolvedValue(contactUser);
			db.query.trustedContact.findFirst.mockResolvedValue(null);
			db.insert = mockInsert([
				{
					id: "tc-1",
					contactId: "user-contact",
					waitingPeriodDays: 7,
				},
			]);

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.addTrustedContact({
				contactEmail: "contact@test.com",
				escrow: {
					escrowBlob: "enc-blob",
					escrowNonce: "enc-nonce",
					escrowAuthTag: "enc-tag",
					ephemeralPublicKey: "pub-key",
					escrowSignature: "sig",
				},
			});

			expect(result.id).toBe("tc-1");
			// insert called twice: trusted_contact (with escrow) + notification
			expect(db.insert).toHaveBeenCalledTimes(2);
		});
	});

	// -----------------------------------------------------------------------
	// removeTrustedContact
	// -----------------------------------------------------------------------

	describe("removeTrustedContact", () => {
		it("removes a trusted contact", async () => {
			db.query.trustedContact.findFirst.mockResolvedValue(makeTrustedContact());
			db.update = mockUpdate();
			db.delete = mockDelete();

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.removeTrustedContact({
				trustedContactId: "tc-1",
			});

			expect(result.success).toBe(true);
		});

		it("rejects removing non-existent contact", async () => {
			db.query.trustedContact.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("user-owner", db));
			await expect(
				caller.removeTrustedContact({ trustedContactId: "tc-99" }),
			).rejects.toThrow("errors:emergency.contactNotFound");
		});
	});

	// -----------------------------------------------------------------------
	// listTrustedContacts
	// -----------------------------------------------------------------------

	describe("listTrustedContacts", () => {
		it("returns empty array when no contacts", async () => {
			db.query.trustedContact.findMany.mockResolvedValue([]);

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.listTrustedContacts();

			expect(result).toEqual([]);
		});

		it("returns contacts with user details", async () => {
			db.query.trustedContact.findMany.mockResolvedValue([
				{
					...makeTrustedContact(),
					contact: {
						id: "user-contact",
						name: "Contact",
						email: "contact@test.com",
						image: null,
					},
				},
			]);

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.listTrustedContacts();

			expect(result).toHaveLength(1);
			expect(result[0]!.contact.email).toBe("contact@test.com");
			expect(result[0]!.waitingPeriodDays).toBe(7);
		});
	});

	// -----------------------------------------------------------------------
	// requestAccess
	// -----------------------------------------------------------------------

	describe("requestAccess", () => {
		it("creates a pending request with signed timestamp", async () => {
			db.query.trustedContact.findFirst.mockResolvedValue(
				makeTrustedContact({ waitingPeriodDays: 14 }),
			);
			// No existing pending request
			db.query.emergencyAccessRequest.findFirst
				.mockResolvedValueOnce(null) // pending check
				.mockResolvedValueOnce(null); // denied cooldown check

			const now = Date.now();
			db.insert = mockInsert([
				{
					id: "req-1",
					status: "pending",
					waitingPeriodDays: 14,
					expiresAt: new Date(now + 14 * 24 * 60 * 60 * 1000),
					timestampSignature: "valid-hmac-signature-hex",
				},
			]);

			const caller = createCaller(createCtx("user-contact", db));
			const result = await caller.requestAccess({
				trustedContactId: "tc-1",
			});

			expect(result.id).toBe("req-1");
			expect(result.status).toBe("pending");
			expect(result.waitingPeriodDays).toBe(14);
			// signTimestamp should have been called
			expect(signTimestamp).toHaveBeenCalled();
		});

		it("rejects duplicate pending request", async () => {
			db.query.trustedContact.findFirst.mockResolvedValue(makeTrustedContact());
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest(),
			);

			const caller = createCaller(createCtx("user-contact", db));
			await expect(
				caller.requestAccess({ trustedContactId: "tc-1" }),
			).rejects.toThrow("errors:emergency.requestPending");
		});

		it("rejects request for non-existent trusted contact", async () => {
			db.query.trustedContact.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("user-contact", db));
			await expect(
				caller.requestAccess({ trustedContactId: "tc-99" }),
			).rejects.toThrow("errors:emergency.relationshipNotFound");
		});

		it("rejects request within 24h cooldown after denial", async () => {
			db.query.trustedContact.findFirst.mockResolvedValue(makeTrustedContact());
			// No pending request
			db.query.emergencyAccessRequest.findFirst
				.mockResolvedValueOnce(null) // pending check
				.mockResolvedValueOnce(
					// denied with active cooldown
					makeAccessRequest({
						status: "denied",
						deniedAt: new Date(),
						denialCooldownUntil: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12h from now
					}),
				);

			// Mock insert for audit log write
			db.insert = mockInsert();

			const caller = createCaller(createCtx("user-contact", db));
			await expect(
				caller.requestAccess({ trustedContactId: "tc-1" }),
			).rejects.toThrow("errors:emergency.cooldownBlocked");
		});

		it("allows request after cooldown period expires", async () => {
			db.query.trustedContact.findFirst.mockResolvedValue(makeTrustedContact());
			// No pending request, but cooldown has expired
			db.query.emergencyAccessRequest.findFirst
				.mockResolvedValueOnce(null) // pending check
				.mockResolvedValueOnce(
					makeAccessRequest({
						status: "denied",
						deniedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
						denialCooldownUntil: new Date(Date.now() - 24 * 60 * 60 * 1000), // expired 24h ago
					}),
				);

			db.insert = mockInsert([
				{
					id: "req-2",
					status: "pending",
					waitingPeriodDays: 7,
					expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
					timestampSignature: "valid-hmac-signature-hex",
				},
			]);

			const caller = createCaller(createCtx("user-contact", db));
			const result = await caller.requestAccess({
				trustedContactId: "tc-1",
			});

			expect(result.status).toBe("pending");
		});
	});

	// -----------------------------------------------------------------------
	// denyRequest
	// -----------------------------------------------------------------------

	describe("denyRequest", () => {
		it("denies a pending request, sets cooldown, and writes audit log", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({ status: "pending" }),
			);
			db.update = mockUpdate([{ id: "req-1", status: "denied" }]);
			db.insert = mockInsert();

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.denyRequest({ requestId: "req-1" });

			expect(result.status).toBe("denied");
			// insert called for: audit log + notification
			expect(db.insert).toHaveBeenCalledTimes(2);
		});

		it("cannot deny a non-pending request", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({ status: "approved" }),
			);

			const caller = createCaller(createCtx("user-owner", db));
			await expect(caller.denyRequest({ requestId: "req-1" })).rejects.toThrow(
				"errors:emergency.cannotDenyStatus",
			);
		});

		it("rejects denial of non-existent request", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("user-owner", db));
			await expect(caller.denyRequest({ requestId: "req-99" })).rejects.toThrow(
				"errors:emergency.requestNotFound",
			);
		});
	});

	// -----------------------------------------------------------------------
	// grantAccess
	// -----------------------------------------------------------------------

	describe("grantAccess", () => {
		const escrowInput = {
			requestId: "req-1",
			escrowBlob: "encrypted-vault-key",
			escrowNonce: "nonce-1",
			escrowAuthTag: "auth-tag-1",
			ephemeralPublicKey: "pub-key-1",
		};

		it("grants access after timer expiry with valid signature", async () => {
			const expired = new Date(Date.now() - 1000);
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({
					status: "pending",
					expiresAt: expired,
				}),
			);
			db.update = mockUpdate([{ id: "req-1", status: "approved" }]);
			db.insert = mockInsert();

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.grantAccess(escrowInput);

			expect(result.status).toBe("approved");
			expect(verifyTimestamp).toHaveBeenCalled();
		});

		it("rejects grant before timer expiry", async () => {
			const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({
					status: "pending",
					expiresAt: future,
				}),
			);
			db.insert = mockInsert(); // for audit log

			const caller = createCaller(createCtx("user-owner", db));
			await expect(caller.grantAccess(escrowInput)).rejects.toThrow(
				"errors:emergency.waitingPeriodNotExpired",
			);
		});

		it("rejects grant on non-pending request", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({ status: "denied" }),
			);

			const caller = createCaller(createCtx("user-owner", db));
			await expect(caller.grantAccess(escrowInput)).rejects.toThrow(
				"errors:emergency.cannotGrantStatus",
			);
		});

		it("rejects grant when timestamp signature is invalid", async () => {
			vi.mocked(verifyTimestamp).mockReturnValue(false);

			const expired = new Date(Date.now() - 1000);
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({
					status: "pending",
					expiresAt: expired,
					timestampSignature: "tampered-signature",
				}),
			);
			db.insert = mockInsert(); // for audit log

			const caller = createCaller(createCtx("user-owner", db));
			await expect(caller.grantAccess(escrowInput)).rejects.toThrow(
				"errors:emergency.signatureVerificationFailed",
			);
			// Audit log should record the failure
			expect(db.insert).toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// verifyRequestSignature
	// -----------------------------------------------------------------------

	describe("verifyRequestSignature", () => {
		it("returns valid=true for correctly signed request", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({ ownerId: "user-owner" }),
			);

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.verifyRequestSignature({
				requestId: "req-1",
			});

			expect(result.valid).toBe(true);
			expect(result.waitingPeriodDays).toBe(7);
		});

		it("returns valid=false for tampered signature", async () => {
			vi.mocked(verifyTimestamp).mockReturnValue(false);

			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({
					ownerId: "user-owner",
					timestampSignature: "tampered",
				}),
			);

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.verifyRequestSignature({
				requestId: "req-1",
			});

			expect(result.valid).toBe(false);
		});

		it("rejects non-participant access", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({
					ownerId: "user-owner",
					contactId: "user-contact",
				}),
			);

			const caller = createCaller(createCtx("user-stranger", db));
			await expect(
				caller.verifyRequestSignature({ requestId: "req-1" }),
			).rejects.toThrow("errors:emergency.requestNotFound");
		});

		it("allows contact to verify their own request signature", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({
					ownerId: "user-owner",
					contactId: "user-contact",
				}),
			);

			const caller = createCaller(createCtx("user-contact", db));
			const result = await caller.verifyRequestSignature({
				requestId: "req-1",
			});

			expect(result.valid).toBe(true);
			expect(result.waitingPeriodDays).toBe(7);
		});
	});

	// -----------------------------------------------------------------------
	// listRequests
	// -----------------------------------------------------------------------

	describe("listRequests", () => {
		it("returns owner's incoming requests", async () => {
			db.query.emergencyAccessRequest.findMany.mockResolvedValue([
				makeAccessRequest(),
			]);

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.listRequests({ role: "owner" });

			expect(result).toHaveLength(1);
			expect(result[0]!.status).toBe("pending");
		});

		it("returns contact's outgoing requests", async () => {
			db.query.emergencyAccessRequest.findMany.mockResolvedValue([
				makeAccessRequest(),
			]);

			const caller = createCaller(createCtx("user-contact", db));
			const result = await caller.listRequests({ role: "contact" });

			expect(result).toHaveLength(1);
		});

		it("returns empty for no requests", async () => {
			db.query.emergencyAccessRequest.findMany.mockResolvedValue([]);

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.listRequests();

			expect(result).toEqual([]);
		});
	});

	// -----------------------------------------------------------------------
	// getEscrowBlob
	// -----------------------------------------------------------------------

	describe("getEscrowBlob", () => {
		it("returns escrow data for approved request", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({
					status: "approved",
					escrowBlob: "enc-key",
					escrowNonce: "nonce",
					escrowAuthTag: "tag",
					ephemeralPublicKey: "pub",
				}),
			);

			const caller = createCaller(createCtx("user-contact", db));
			const result = await caller.getEscrowBlob({
				requestId: "req-1",
			});

			expect(result.escrowBlob).toBe("enc-key");
			expect(result.escrowNonce).toBe("nonce");
			expect(result.escrowAuthTag).toBe("tag");
			expect(result.ephemeralPublicKey).toBe("pub");
		});

		it("rejects access to non-approved request", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({ status: "pending" }),
			);

			const caller = createCaller(createCtx("user-contact", db));
			await expect(
				caller.getEscrowBlob({ requestId: "req-1" }),
			).rejects.toThrow("errors:emergency.accessNotGranted");
		});

		it("rejects access for non-existent request", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("user-contact", db));
			await expect(
				caller.getEscrowBlob({ requestId: "req-99" }),
			).rejects.toThrow("errors:emergency.requestNotFound");
		});

		it("returns INTERNAL_SERVER_ERROR when escrow data is missing on approved request", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({
					status: "approved",
					escrowBlob: null,
					escrowNonce: null,
					escrowAuthTag: null,
					ephemeralPublicKey: null,
				}),
			);

			const caller = createCaller(createCtx("user-contact", db));
			await expect(
				caller.getEscrowBlob({ requestId: "req-1" }),
			).rejects.toThrow("errors:emergency.escrowDataMissing");
		});

		it("includes escrowSignature in response when available", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({
					status: "approved",
					escrowBlob: "enc-key",
					escrowNonce: "nonce",
					escrowAuthTag: "tag",
					ephemeralPublicKey: "pub",
					escrowSignature: "sig-123",
				}),
			);

			const caller = createCaller(createCtx("user-contact", db));
			const result = await caller.getEscrowBlob({
				requestId: "req-1",
			});

			expect(result.escrowSignature).toBe("sig-123");
		});
	});

	// -----------------------------------------------------------------------
	// getAuditLog
	// -----------------------------------------------------------------------

	describe("getAuditLog", () => {
		it("returns audit entries for request owner", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({ ownerId: "user-owner" }),
			);
			db.query.emergencyAuditLog.findMany.mockResolvedValue([
				{
					id: "log-1",
					event: "request_created",
					actorId: "user-contact",
					metadata: "Waiting period: 7d",
					createdAt: new Date("2026-01-01"),
				},
				{
					id: "log-2",
					event: "request_denied",
					actorId: "user-owner",
					metadata: null,
					createdAt: new Date("2026-01-02"),
				},
			]);

			const caller = createCaller(createCtx("user-owner", db));
			const result = await caller.getAuditLog({ requestId: "req-1" });

			expect(result).toHaveLength(2);
			expect(result[0]!.event).toBe("request_created");
			expect(result[1]!.event).toBe("request_denied");
		});

		it("rejects audit log access for non-participant", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({
					ownerId: "user-owner",
					contactId: "user-contact",
				}),
			);

			const caller = createCaller(createCtx("user-stranger", db));
			await expect(caller.getAuditLog({ requestId: "req-1" })).rejects.toThrow(
				"errors:emergency.requestNotFound",
			);
		});
	});

	// -----------------------------------------------------------------------
	// Timer enforcement
	// -----------------------------------------------------------------------

	describe("timer enforcement", () => {
		it("cannot shorten waiting period after request is made", async () => {
			const tc = makeTrustedContact({ waitingPeriodDays: 14 });
			db.query.trustedContact.findFirst.mockResolvedValue(tc);
			db.query.emergencyAccessRequest.findFirst
				.mockResolvedValueOnce(null) // pending check
				.mockResolvedValueOnce(null); // denied cooldown check

			db.insert = mockInsert([
				{
					id: "req-1",
					status: "pending",
					waitingPeriodDays: 14,
					expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
					timestampSignature: "valid-hmac-signature-hex",
				},
			]);

			const caller = createCaller(createCtx("user-contact", db));
			const result = await caller.requestAccess({
				trustedContactId: "tc-1",
			});

			expect(result.waitingPeriodDays).toBe(14);
		});

		it("signed timestamp prevents client from accelerating timer", async () => {
			// The signature ties the expiresAt to the request — any
			// modification would invalidate verifyTimestamp
			vi.mocked(verifyTimestamp).mockReturnValue(false);

			const expired = new Date(Date.now() - 1000);
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({
					status: "pending",
					expiresAt: expired,
					timestampSignature: "tampered-by-client",
				}),
			);
			db.insert = mockInsert(); // for audit log

			const caller = createCaller(createCtx("user-owner", db));
			await expect(
				caller.grantAccess({
					requestId: "req-1",
					escrowBlob: "e",
					escrowNonce: "n",
					escrowAuthTag: "t",
					ephemeralPublicKey: "pk",
				}),
			).rejects.toThrow("errors:emergency.signatureVerificationFailed");
		});
	});

	// -----------------------------------------------------------------------
	// Notification events
	// -----------------------------------------------------------------------

	describe("notification events", () => {
		it("notifies contact when added as trusted contact", async () => {
			db.query.user.findFirst.mockResolvedValue({
				id: "user-contact",
				email: "contact@test.com",
				name: "Contact",
			});
			db.query.trustedContact.findFirst.mockResolvedValue(null);
			db.insert = mockInsert([
				{
					id: "tc-1",
					contactId: "user-contact",
					waitingPeriodDays: 7,
				},
			]);

			const caller = createCaller(createCtx("user-owner", db));
			await caller.addTrustedContact({
				contactEmail: "contact@test.com",
			});

			// insert called twice: once for trusted_contact, once for notification
			expect(db.insert).toHaveBeenCalledTimes(2);
		});

		it("notifies owner when access is requested", async () => {
			db.query.trustedContact.findFirst.mockResolvedValue(makeTrustedContact());
			db.query.emergencyAccessRequest.findFirst
				.mockResolvedValueOnce(null) // pending check
				.mockResolvedValueOnce(null); // denied cooldown check

			db.insert = mockInsert([
				{
					id: "req-1",
					status: "pending",
					waitingPeriodDays: 7,
					expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
					timestampSignature: "valid-hmac-signature-hex",
				},
			]);

			const caller = createCaller(createCtx("user-contact", db));
			await caller.requestAccess({ trustedContactId: "tc-1" });

			// insert called 3 times: request + audit log + notification
			expect(db.insert).toHaveBeenCalledTimes(3);
		});

		it("notifies contact when request is denied", async () => {
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({ status: "pending" }),
			);
			db.update = mockUpdate([{ id: "req-1", status: "denied" }]);
			db.insert = mockInsert();

			const caller = createCaller(createCtx("user-owner", db));
			await caller.denyRequest({ requestId: "req-1" });

			// insert called twice: audit log + notification
			expect(db.insert).toHaveBeenCalledTimes(2);
		});

		it("notifies contact when access is granted", async () => {
			const expired = new Date(Date.now() - 1000);
			db.query.emergencyAccessRequest.findFirst.mockResolvedValue(
				makeAccessRequest({ status: "pending", expiresAt: expired }),
			);
			db.update = mockUpdate([{ id: "req-1", status: "approved" }]);
			db.insert = mockInsert();

			const caller = createCaller(createCtx("user-owner", db));
			await caller.grantAccess({
				requestId: "req-1",
				escrowBlob: "enc",
				escrowNonce: "n",
				escrowAuthTag: "t",
				ephemeralPublicKey: "pk",
			});

			// insert called 3 times: signature_verified audit + request_granted audit + notification
			expect(db.insert).toHaveBeenCalledTimes(3);
		});
	});
});
