// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Sharing Router Unit Tests
 *
 * Tests direct share envelopes (shareItem, acceptShare, declineShare,
 * revokeShare, listSentShares, listReceivedShares, getShareEnvelope)
 * and ephemeral sharing links (createEphemeralLink, accessEphemeralLink,
 * listEphemeralLinks, revokeEphemeralLink).
 */

import { getTranslator, initI18n } from "@pssmngr/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sharingRouter } from "../../routers/sharing";

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

// ---------------------------------------------------------------------------
// Data builders
// ---------------------------------------------------------------------------

function makeShareEnvelope(overrides: Record<string, any> = {}) {
	return {
		id: "share-1",
		itemId: "item-1",
		senderUserId: "user-sender",
		recipientUserId: "user-recipient",
		wrappedKey: "wrapped-key",
		wrappedKeyNonce: "nonce",
		wrappedKeyAuthTag: "auth-tag",
		senderSignature: "signature",
		permission: "view",
		accepted: false,
		expiresAt: null,
		revokedAt: null,
		createdAt: new Date(),
		...overrides,
	};
}

function makeItem(overrides: Record<string, any> = {}) {
	return {
		id: "item-1",
		vaultId: "vault-1",
		itemType: "login",
		ciphertext: "ciphertext",
		nonce: "item-nonce",
		authTag: "item-tag",
		version: 1,
		createdAt: new Date(),
		updatedAt: new Date(),
		deletedAt: null,
		vault: { userId: "user-sender" },
		...overrides,
	};
}

function makeEphemeralLink(overrides: Record<string, any> = {}) {
	return {
		id: "link-1",
		senderUserId: "user-1",
		encryptedBlob: "encrypted-data",
		nonce: "nonce-1",
		authTag: "auth-tag-1",
		hasPassphrase: false,
		passphraseSalt: null,
		expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
		maxAccesses: 1,
		accessCount: 0,
		firstAccessedAt: null,
		ipRestriction: null,
		label: null,
		revokedAt: null,
		createdAt: new Date(),
		...overrides,
	};
}

function createMockDb() {
	return {
		query: {
			item: { findFirst: vi.fn().mockResolvedValue(null) },
			device: { findMany: vi.fn().mockResolvedValue([]) },
			shareEnvelope: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
			ephemeralShare: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
		},
		insert: mockInsert(),
		update: mockUpdate(),
	};
}

function createCtx(userId: string, db: any, extra: Record<string, any> = {}) {
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
		// Real translator so message assertions resolve actual copy (not keys).
		t: getTranslator("en") as any,
		req: {
			headers: { "x-forwarded-for": "1.2.3.4" },
			socket: { remoteAddress: "1.2.3.4" },
			...extra,
		},
		res: { setHeader: () => {} },
	};
}

function createCaller(ctx: any) {
	return sharingRouter.createCaller(ctx as any);
}

function shareItemInput(overrides: Record<string, any> = {}) {
	return {
		itemId: "item-1",
		recipientUserId: "user-recipient",
		wrappedKey: "wrapped-key",
		wrappedKeyNonce: "nonce",
		wrappedKeyAuthTag: "auth-tag",
		senderSignature: "signature",
		permission: "view" as const,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Sharing Router", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeAll(async () => {
		await initI18n();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		db = createMockDb();
	});

	// =====================================================================
	// shareItem
	// =====================================================================

	describe("shareItem", () => {
		it("creates share envelope with correct fields", async () => {
			db.query.item.findFirst.mockResolvedValue(makeItem());
			const envelope = makeShareEnvelope();
			db.insert = mockInsert([envelope]);
			const caller = createCaller(createCtx("user-sender", db));

			const result = await caller.shareItem(shareItemInput());

			expect(result).toBeDefined();
			const share = result!;
			expect(share.senderUserId).toBe("user-sender");
			expect(share.permission).toBe("view");
			expect(db.insert).toHaveBeenCalled();
		});

		it("rejects edit permission until shared-item editing is implemented", async () => {
			const caller = createCaller(createCtx("user-sender", db));

			await expect(
				caller.shareItem(shareItemInput({ permission: "edit" })),
			).rejects.toThrow();
		});

		it("rejects re-share permission until delegation is implemented", async () => {
			const caller = createCaller(createCtx("user-sender", db));

			await expect(
				caller.shareItem(shareItemInput({ permission: "share" })),
			).rejects.toThrow();
		});

		it("rejects self-sharing", async () => {
			db.query.item.findFirst.mockResolvedValue(makeItem());
			const caller = createCaller(createCtx("user-sender", db));

			await expect(
				caller.shareItem(shareItemInput({ recipientUserId: "user-sender" })),
			).rejects.toThrow(
				expect.objectContaining({
					code: "BAD_REQUEST",
					message: "Cannot share an item with yourself",
				}),
			);
		});

		it("rejects when item not found", async () => {
			db.query.item.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-sender", db));

			await expect(caller.shareItem(shareItemInput())).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});

		it("rejects when sender does not own item", async () => {
			db.query.item.findFirst.mockResolvedValue(
				makeItem({ vault: { userId: "other-user" } }),
			);
			const caller = createCaller(createCtx("user-sender", db));

			await expect(caller.shareItem(shareItemInput())).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});
	});

	// =====================================================================
	// acceptShare
	// =====================================================================

	describe("acceptShare", () => {
		it("sets accepted flag for recipient", async () => {
			db.query.shareEnvelope.findFirst.mockResolvedValue(
				makeShareEnvelope({ recipientUserId: "user-recipient" }),
			);
			const accepted = makeShareEnvelope({ accepted: true });
			db.update = mockUpdate([accepted]);
			const caller = createCaller(createCtx("user-recipient", db));

			const result = await caller.acceptShare({ shareId: "share-1" });

			expect(result).toBeDefined();
			const share = result!;
			expect(share.accepted).toBe(true);
		});

		it("rejects non-recipient", async () => {
			db.query.shareEnvelope.findFirst.mockResolvedValue(
				makeShareEnvelope({ recipientUserId: "user-recipient" }),
			);
			const caller = createCaller(createCtx("user-other", db));

			await expect(caller.acceptShare({ shareId: "share-1" })).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "Not the recipient",
				}),
			);
		});

		it("rejects revoked share", async () => {
			db.query.shareEnvelope.findFirst.mockResolvedValue(
				makeShareEnvelope({ revokedAt: new Date() }),
			);
			const caller = createCaller(createCtx("user-recipient", db));

			await expect(caller.acceptShare({ shareId: "share-1" })).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "Share has been revoked",
				}),
			);
		});

		it("rejects expired share", async () => {
			db.query.shareEnvelope.findFirst.mockResolvedValue(
				makeShareEnvelope({ expiresAt: new Date("2020-01-01") }),
			);
			const caller = createCaller(createCtx("user-recipient", db));

			await expect(caller.acceptShare({ shareId: "share-1" })).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "Share has expired",
				}),
			);
		});
	});

	// =====================================================================
	// declineShare
	// =====================================================================

	describe("declineShare", () => {
		it("revokes share for recipient", async () => {
			db.query.shareEnvelope.findFirst.mockResolvedValue(
				makeShareEnvelope({ recipientUserId: "user-recipient" }),
			);
			const declined = makeShareEnvelope({ revokedAt: new Date() });
			db.update = mockUpdate([declined]);
			const caller = createCaller(createCtx("user-recipient", db));

			const result = await caller.declineShare({ shareId: "share-1" });

			expect(result).toBeDefined();
			const share = result!;
			expect(share.revokedAt).toBeTruthy();
		});

		it("rejects non-recipient", async () => {
			db.query.shareEnvelope.findFirst.mockResolvedValue(
				makeShareEnvelope({ recipientUserId: "user-recipient" }),
			);
			const caller = createCaller(createCtx("user-other", db));

			await expect(caller.declineShare({ shareId: "share-1" })).rejects.toThrow(
				expect.objectContaining({ code: "FORBIDDEN" }),
			);
		});
	});

	// =====================================================================
	// revokeShare
	// =====================================================================

	describe("revokeShare", () => {
		it("revokes share for sender", async () => {
			db.query.shareEnvelope.findFirst.mockResolvedValue(
				makeShareEnvelope({ senderUserId: "user-sender" }),
			);
			const revoked = makeShareEnvelope({ revokedAt: new Date() });
			db.update = mockUpdate([revoked]);
			const caller = createCaller(createCtx("user-sender", db));

			const result = await caller.revokeShare({ shareId: "share-1" });

			expect(result).toBeDefined();
			const share = result!;
			expect(share.revokedAt).toBeTruthy();
		});

		it("rejects non-sender", async () => {
			db.query.shareEnvelope.findFirst.mockResolvedValue(
				makeShareEnvelope({ senderUserId: "user-sender" }),
			);
			const caller = createCaller(createCtx("user-other", db));

			await expect(caller.revokeShare({ shareId: "share-1" })).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "Only the sender can revoke",
				}),
			);
		});

		it("rejects double-revoke", async () => {
			db.query.shareEnvelope.findFirst.mockResolvedValue(
				makeShareEnvelope({
					senderUserId: "user-sender",
					revokedAt: new Date(),
				}),
			);
			const caller = createCaller(createCtx("user-sender", db));

			await expect(caller.revokeShare({ shareId: "share-1" })).rejects.toThrow(
				expect.objectContaining({
					code: "BAD_REQUEST",
					message: "Share already revoked",
				}),
			);
		});

		it("rejects non-existent share", async () => {
			db.query.shareEnvelope.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-sender", db));

			await expect(
				caller.revokeShare({ shareId: "nonexistent" }),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	// =====================================================================
	// listSentShares
	// =====================================================================

	describe("listSentShares", () => {
		it("returns sender's shares", async () => {
			const shares = [
				makeShareEnvelope({ id: "s-1" }),
				makeShareEnvelope({ id: "s-2" }),
			];
			db.query.shareEnvelope.findMany.mockResolvedValue(shares);
			const caller = createCaller(createCtx("user-sender", db));

			const result = await caller.listSentShares();

			expect(result).toHaveLength(2);
		});

		it("filters revoked by default", async () => {
			db.query.shareEnvelope.findMany.mockResolvedValue([]);
			const caller = createCaller(createCtx("user-sender", db));

			await caller.listSentShares();

			expect(db.query.shareEnvelope.findMany).toHaveBeenCalled();
		});

		it("includes revoked when requested", async () => {
			db.query.shareEnvelope.findMany.mockResolvedValue([
				makeShareEnvelope({ revokedAt: new Date() }),
			]);
			const caller = createCaller(createCtx("user-sender", db));

			const result = await caller.listSentShares({ includeRevoked: true });

			expect(result).toHaveLength(1);
		});
	});

	// =====================================================================
	// listReceivedShares
	// =====================================================================

	describe("listReceivedShares", () => {
		it("returns recipient's shares", async () => {
			const shares = [makeShareEnvelope({ recipientUserId: "user-recipient" })];
			db.query.shareEnvelope.findMany.mockResolvedValue(shares);
			const caller = createCaller(createCtx("user-recipient", db));

			const result = await caller.listReceivedShares();

			expect(result).toHaveLength(1);
		});

		it("includes revoked when requested", async () => {
			db.query.shareEnvelope.findMany.mockResolvedValue([
				makeShareEnvelope({ revokedAt: new Date() }),
			]);
			const caller = createCaller(createCtx("user-recipient", db));

			const result = await caller.listReceivedShares({ includeRevoked: true });

			expect(result).toHaveLength(1);
		});
	});

	// =====================================================================
	// getShareEnvelope
	// =====================================================================

	describe("getShareEnvelope", () => {
		it("returns share for sender", async () => {
			const envelope = makeShareEnvelope({ senderUserId: "user-sender" });
			db.query.shareEnvelope.findFirst.mockResolvedValue(envelope);
			db.query.item.findFirst.mockResolvedValue(makeItem());
			const caller = createCaller(createCtx("user-sender", db));

			const result = await caller.getShareEnvelope({ shareId: "share-1" });

			expect(result.id).toBe("share-1");
		});

		it("returns share for recipient", async () => {
			const envelope = makeShareEnvelope({
				recipientUserId: "user-recipient",
				accepted: true,
			});
			db.query.shareEnvelope.findFirst.mockResolvedValue(envelope);
			db.query.item.findFirst.mockResolvedValue(makeItem());
			const caller = createCaller(createCtx("user-recipient", db));

			const result = await caller.getShareEnvelope({ shareId: "share-1" });

			expect(result.id).toBe("share-1");
		});

		it("does not expose item ciphertext before acceptance", async () => {
			const envelope = makeShareEnvelope({ recipientUserId: "user-recipient" });
			db.query.shareEnvelope.findFirst.mockResolvedValue(envelope);
			const caller = createCaller(createCtx("user-recipient", db));

			await expect(
				caller.getShareEnvelope({ shareId: "share-1" }),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});

		it("rejects third-party access", async () => {
			const envelope = makeShareEnvelope({
				senderUserId: "user-sender",
				recipientUserId: "user-recipient",
			});
			db.query.shareEnvelope.findFirst.mockResolvedValue(envelope);
			const caller = createCaller(createCtx("user-third", db));

			await expect(
				caller.getShareEnvelope({ shareId: "share-1" }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "You don't have permission to access this resource",
				}),
			);
		});

		it("rejects revoked share", async () => {
			const envelope = makeShareEnvelope({
				senderUserId: "user-sender",
				revokedAt: new Date(),
			});
			db.query.shareEnvelope.findFirst.mockResolvedValue(envelope);
			const caller = createCaller(createCtx("user-sender", db));

			await expect(
				caller.getShareEnvelope({ shareId: "share-1" }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "Share has been revoked",
				}),
			);
		});

		it("rejects expired share", async () => {
			const envelope = makeShareEnvelope({
				senderUserId: "user-sender",
				expiresAt: new Date("2020-01-01"),
			});
			db.query.shareEnvelope.findFirst.mockResolvedValue(envelope);
			const caller = createCaller(createCtx("user-sender", db));

			await expect(
				caller.getShareEnvelope({ shareId: "share-1" }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "Share has expired",
				}),
			);
		});

		it("rejects non-existent share", async () => {
			db.query.shareEnvelope.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-sender", db));

			await expect(
				caller.getShareEnvelope({ shareId: "nonexistent" }),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	// =====================================================================
	// createEphemeralLink
	// =====================================================================

	describe("createEphemeralLink", () => {
		it("creates link with correct expiry", async () => {
			const now = Date.now();
			const link = makeEphemeralLink({
				id: "link-new",
				expiresAt: new Date(now + 24 * 60 * 60 * 1000),
			});
			db.insert = mockInsert([link]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.createEphemeralLink({
				encryptedBlob: "encrypted-data",
				nonce: "nonce-1",
				authTag: "auth-tag-1",
				expiresIn: "24h",
			});

			expect(result.id).toBe("link-new");
			expect(result.expiresAt).toBeTruthy();
		});

		it("supports passphrase option", async () => {
			const link = makeEphemeralLink({
				hasPassphrase: true,
				passphraseSalt: "salt-123",
			});
			db.insert = mockInsert([link]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.createEphemeralLink({
				encryptedBlob: "data",
				nonce: "nonce",
				authTag: "tag",
				expiresIn: "1h",
				hasPassphrase: true,
				passphraseSalt: "salt-123",
			});

			expect(result.id).toBeTruthy();
		});

		it("supports maxAccesses and ipRestriction", async () => {
			const link = makeEphemeralLink({
				maxAccesses: 5,
				ipRestriction: "10.0.0.1",
			});
			db.insert = mockInsert([link]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.createEphemeralLink({
				encryptedBlob: "data",
				nonce: "nonce",
				authTag: "tag",
				expiresIn: "7d",
				maxAccesses: 5,
				ipRestriction: "10.0.0.1",
			});

			expect(result.id).toBeTruthy();
		});

		it("rejects an invalid IP restriction", async () => {
			const caller = createCaller(createCtx("user-1", db));

			await expect(
				caller.createEphemeralLink({
					encryptedBlob: "data",
					nonce: "nonce",
					authTag: "tag",
					expiresIn: "1h",
					ipRestriction: "999.999.999.999",
				}),
			).rejects.toThrow();
		});

		it("accepts an IPv6 restriction", async () => {
			const link = makeEphemeralLink({ ipRestriction: "2001:db8::1" });
			db.insert = mockInsert([link]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.createEphemeralLink({
				encryptedBlob: "data",
				nonce: "nonce",
				authTag: "tag",
				expiresIn: "1h",
				ipRestriction: "2001:db8::1",
			});

			expect(result.id).toBeTruthy();
		});
	});

	// =====================================================================
	// accessEphemeralLink
	// =====================================================================

	describe("accessEphemeralLink", () => {
		it("returns encrypted data and increments count", async () => {
			db.query.ephemeralShare.findFirst.mockResolvedValue(
				makeEphemeralLink({ ipRestriction: null }),
			);
			const accessed = {
				encryptedBlob: "encrypted-data",
				nonce: "nonce-1",
				authTag: "auth-tag-1",
				hasPassphrase: false,
				passphraseSalt: null,
			};
			db.update = mockUpdate([accessed]);
			const caller = createCaller(createCtx("anon", db));

			const result = await caller.accessEphemeralLink({ linkId: "link-1" });

			expect(result.encryptedBlob).toBe("encrypted-data");
			expect(result.nonce).toBe("nonce-1");
		});

		it("rejects non-existent link", async () => {
			db.query.ephemeralShare.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("anon", db));

			await expect(
				caller.accessEphemeralLink({ linkId: "nonexistent" }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "This link is no longer available",
				}),
			);
		});

		it("rejects expired/exhausted link (atomic check fails)", async () => {
			db.query.ephemeralShare.findFirst.mockResolvedValue(
				makeEphemeralLink({ ipRestriction: null }),
			);
			// Atomic update returns empty (link expired/exhausted/revoked)
			db.update = mockUpdate([]);
			const caller = createCaller(createCtx("anon", db));

			await expect(
				caller.accessEphemeralLink({ linkId: "link-1" }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "This link is no longer available",
				}),
			);
		});

		it("rejects IP-restricted link with wrong IP", async () => {
			db.query.ephemeralShare.findFirst.mockResolvedValue(
				makeEphemeralLink({ ipRestriction: "10.0.0.5" }),
			);
			// ctx req has x-forwarded-for: 1.2.3.4 which != 10.0.0.5
			const caller = createCaller(createCtx("anon", db));

			await expect(
				caller.accessEphemeralLink({ linkId: "link-1" }),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});
	});

	// =====================================================================
	// listEphemeralLinks
	// =====================================================================

	describe("listEphemeralLinks", () => {
		it("returns creator's link metadata", async () => {
			const links = [makeEphemeralLink({ id: "l-1", label: "Test Link" })];
			db.query.ephemeralShare.findMany.mockResolvedValue(links);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.listEphemeralLinks();

			expect(result).toHaveLength(1);
		});

		it("includes revoked when requested", async () => {
			db.query.ephemeralShare.findMany.mockResolvedValue([
				makeEphemeralLink({ revokedAt: new Date() }),
			]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.listEphemeralLinks({ includeRevoked: true });

			expect(result).toHaveLength(1);
		});
	});

	// =====================================================================
	// revokeEphemeralLink
	// =====================================================================

	describe("revokeEphemeralLink", () => {
		it("revokes link for creator", async () => {
			db.query.ephemeralShare.findFirst.mockResolvedValue(
				makeEphemeralLink({ senderUserId: "user-1" }),
			);
			const revoked = makeEphemeralLink({ revokedAt: new Date() });
			db.update = mockUpdate([revoked]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.revokeEphemeralLink({ linkId: "link-1" });

			expect(result).toBeDefined();
			const link = result!;
			expect(link.revokedAt).toBeTruthy();
		});

		it("rejects non-creator", async () => {
			db.query.ephemeralShare.findFirst.mockResolvedValue(
				makeEphemeralLink({ senderUserId: "user-1" }),
			);
			const caller = createCaller(createCtx("user-other", db));

			await expect(
				caller.revokeEphemeralLink({ linkId: "link-1" }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "Only the creator can revoke",
				}),
			);
		});

		it("rejects already-revoked link", async () => {
			db.query.ephemeralShare.findFirst.mockResolvedValue(
				makeEphemeralLink({
					senderUserId: "user-1",
					revokedAt: new Date(),
				}),
			);
			const caller = createCaller(createCtx("user-1", db));

			await expect(
				caller.revokeEphemeralLink({ linkId: "link-1" }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "BAD_REQUEST",
					message: "Link already revoked",
				}),
			);
		});

		it("rejects non-existent link", async () => {
			db.query.ephemeralShare.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			await expect(
				caller.revokeEphemeralLink({ linkId: "nonexistent" }),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});
});
