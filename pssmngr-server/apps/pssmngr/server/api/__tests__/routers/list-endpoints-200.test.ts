// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * List Endpoints Return 200 — Smoke Tests
 *
 * Confirms all list endpoints return HTTP 200 with empty arrays (not errors)
 * when no data exists. Also includes regression tests ensuring mutation
 * endpoints still throw NOT_FOUND for non-existent resources.
 */

import { describe, expect, it, vi } from "vitest";
import { credentialsRouter } from "../../routers/credentials";
import { emergencyRouter } from "../../routers/emergency";
import { sharingRouter } from "../../routers/sharing";
import { vaultRouter } from "../../routers/vault";

// ---------------------------------------------------------------------------
// Mock the time-lock signing module (required by emergency router)
// ---------------------------------------------------------------------------

vi.mock("@pssmngr/server/utils/emergency-timelock", () => ({
	DENIAL_COOLDOWN_MS: 24 * 60 * 60 * 1000,
	signTimestamp: vi.fn().mockReturnValue("valid-hmac-signature-hex"),
	verifyTimestamp: vi.fn().mockReturnValue(true),
}));

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

function createVaultMockDb() {
	return {
		query: {
			vault: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
		},
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	};
}

function createSharingMockDb() {
	return {
		query: {
			item: { findFirst: vi.fn().mockResolvedValue(null) },
			shareEnvelope: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
			ephemeralShare: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
		},
		insert: vi.fn(),
		update: vi.fn(),
	};
}

function createEmergencyMockDb() {
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
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	};
}

function createCredentialsMockDb() {
	return {
		query: {
			vault: { findFirst: vi.fn().mockResolvedValue(null) },
			item: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
			itemVersion: { findMany: vi.fn().mockResolvedValue([]) },
		},
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockImplementation(() => {
				const p = Promise.resolve(undefined);
				(p as any).returning = vi.fn().mockResolvedValue([{}]);
				return p;
			}),
		}),
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockImplementation(() => ({
				where: vi.fn().mockImplementation(() => {
					const p = Promise.resolve(undefined);
					(p as any).returning = vi.fn().mockResolvedValue([{}]);
					return p;
				}),
			})),
		}),
		delete: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		}),
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
			headers: { "x-forwarded-for": "1.2.3.4" },
			socket: { remoteAddress: "1.2.3.4" },
		},
		res: { setHeader: () => {} },
	};
}

// ---------------------------------------------------------------------------
// Smoke tests — all list endpoints return 200 with empty data
// ---------------------------------------------------------------------------

describe("list endpoints return 200 with empty arrays", () => {
	it("vault.list returns empty array for new user", async () => {
		const db = createVaultMockDb();
		db.query.vault.findMany.mockResolvedValue([]);
		const caller = vaultRouter.createCaller(createCtx("new-user", db) as any);

		const result = await caller.list();

		expect(result).toEqual([]);
	});

	it("sharing.listSentShares returns empty array", async () => {
		const db = createSharingMockDb();
		db.query.shareEnvelope.findMany.mockResolvedValue([]);
		const caller = sharingRouter.createCaller(createCtx("user-1", db) as any);

		const result = await caller.listSentShares();

		expect(result).toEqual([]);
	});

	it("sharing.listReceivedShares returns empty array", async () => {
		const db = createSharingMockDb();
		db.query.shareEnvelope.findMany.mockResolvedValue([]);
		const caller = sharingRouter.createCaller(createCtx("user-1", db) as any);

		const result = await caller.listReceivedShares();

		expect(result).toEqual([]);
	});

	it("sharing.listEphemeralLinks returns empty array", async () => {
		const db = createSharingMockDb();
		db.query.ephemeralShare.findMany.mockResolvedValue([]);
		const caller = sharingRouter.createCaller(createCtx("user-1", db) as any);

		const result = await caller.listEphemeralLinks();

		expect(result).toEqual([]);
	});

	it("emergency.listTrustedContacts returns empty array", async () => {
		const db = createEmergencyMockDb();
		db.query.trustedContact.findMany.mockResolvedValue([]);
		const caller = emergencyRouter.createCaller(createCtx("user-1", db) as any);

		const result = await caller.listTrustedContacts();

		expect(result).toEqual([]);
	});

	it("emergency.listRequests returns empty array", async () => {
		const db = createEmergencyMockDb();
		db.query.emergencyAccessRequest.findMany.mockResolvedValue([]);
		const caller = emergencyRouter.createCaller(createCtx("user-1", db) as any);

		const result = await caller.listRequests();

		expect(result).toEqual([]);
	});

	it("credentials.list returns empty for nonexistent vault", async () => {
		const db = createCredentialsMockDb();
		db.query.vault.findFirst.mockResolvedValue(null);
		const caller = credentialsRouter.createCaller(
			createCtx("user-1", db) as any,
		);

		const result = await caller.list({ vaultId: "nonexistent", limit: 50 });

		expect(result).toEqual({ items: [], nextCursor: undefined });
	});

	it("credentials.listTrash returns empty for nonexistent vault", async () => {
		const db = createCredentialsMockDb();
		db.query.vault.findFirst.mockResolvedValue(null);
		const caller = credentialsRouter.createCaller(
			createCtx("user-1", db) as any,
		);

		const result = await caller.listTrash({ vaultId: "nonexistent" });

		expect(result).toEqual({ items: [], nextCursor: undefined });
	});
});

// ---------------------------------------------------------------------------
// Regression — mutation endpoints still throw NOT_FOUND
// ---------------------------------------------------------------------------

describe("mutation endpoints still throw NOT_FOUND", () => {
	it("credentials.get throws NOT_FOUND for non-existent item", async () => {
		const db = createCredentialsMockDb();
		db.query.item.findFirst.mockResolvedValue(null);
		const caller = credentialsRouter.createCaller(
			createCtx("user-1", db) as any,
		);

		await expect(caller.get({ itemId: "nonexistent" })).rejects.toThrow(
			expect.objectContaining({ code: "NOT_FOUND" }),
		);
	});

	it("credentials.update throws NOT_FOUND for non-existent item", async () => {
		const db = createCredentialsMockDb();
		db.query.item.findFirst.mockResolvedValue(null);
		const caller = credentialsRouter.createCaller(
			createCtx("user-1", db) as any,
		);

		await expect(
			caller.update({
				itemId: "nonexistent",
				ciphertext: "d",
				nonce: "n",
				authTag: "a",
				wrappedDataKey: "k",
				wrappedDataKeyNonce: "kn",
				wrappedDataKeyAuthTag: "kt",
			}),
		).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
	});

	it("credentials.softDelete throws NOT_FOUND for non-existent item", async () => {
		const db = createCredentialsMockDb();
		db.query.item.findFirst.mockResolvedValue(null);
		const caller = credentialsRouter.createCaller(
			createCtx("user-1", db) as any,
		);

		await expect(caller.softDelete({ itemId: "nonexistent" })).rejects.toThrow(
			expect.objectContaining({ code: "NOT_FOUND" }),
		);
	});

	it("credentials.permanentDelete throws NOT_FOUND for non-existent item", async () => {
		const db = createCredentialsMockDb();
		db.query.item.findFirst.mockResolvedValue(null);
		const caller = credentialsRouter.createCaller(
			createCtx("user-1", db) as any,
		);

		await expect(
			caller.permanentDelete({ itemId: "nonexistent" }),
		).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
	});

	it("credentials.restore throws NOT_FOUND for non-existent item", async () => {
		const db = createCredentialsMockDb();
		db.query.item.findFirst.mockResolvedValue(null);
		const caller = credentialsRouter.createCaller(
			createCtx("user-1", db) as any,
		);

		await expect(caller.restore({ itemId: "nonexistent" })).rejects.toThrow(
			expect.objectContaining({ code: "NOT_FOUND" }),
		);
	});

	it("credentials.toggleFavorite throws NOT_FOUND for non-existent item", async () => {
		const db = createCredentialsMockDb();
		db.query.item.findFirst.mockResolvedValue(null);
		const caller = credentialsRouter.createCaller(
			createCtx("user-1", db) as any,
		);

		await expect(
			caller.toggleFavorite({ itemId: "nonexistent" }),
		).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
	});

	it("vault.get throws NOT_FOUND for non-existent vault", async () => {
		const db = createVaultMockDb();
		db.query.vault.findFirst.mockResolvedValue(null);
		const caller = vaultRouter.createCaller(createCtx("user-1", db) as any);

		await expect(caller.get({ vaultId: "nonexistent" })).rejects.toThrow(
			expect.objectContaining({ code: "NOT_FOUND" }),
		);
	});

	it("sharing.revokeShare throws NOT_FOUND for non-existent share", async () => {
		const db = createSharingMockDb();
		db.query.shareEnvelope.findFirst.mockResolvedValue(null);
		const caller = sharingRouter.createCaller(createCtx("user-1", db) as any);

		await expect(
			caller.revokeShare({ shareId: "nonexistent" }),
		).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
	});

	it("sharing.getShareEnvelope throws NOT_FOUND for non-existent share", async () => {
		const db = createSharingMockDb();
		db.query.shareEnvelope.findFirst.mockResolvedValue(null);
		const caller = sharingRouter.createCaller(createCtx("user-1", db) as any);

		await expect(
			caller.getShareEnvelope({ shareId: "nonexistent" }),
		).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
	});
});
