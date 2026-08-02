// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Real-database integration harness for the family / shared-vault / invitation
 * workflow.
 *
 * Unlike the mock-based router unit tests (`server/api/__tests__/routers/*`),
 * this harness talks to a real Postgres database (`TEST_DATABASE_URL`, default
 * derived from `DATABASE_URL` by swapping the database name to `pssmngr_test`)
 * and drives the actual tRPC routers via `createCaller` with two or more real
 * users. It also performs real X25519 / Ed25519 / ChaCha20-Poly1305 crypto via
 * Node's built-in `node:crypto`, so the wrapped-key envelopes stored by the
 * server are provably decryptable by the intended member and nobody else.
 *
 * The wrapping scheme mirrors `crypto/src/sharing.ts` in spirit: ECDH ->
 * HKDF wrap key -> AEAD -> Ed25519-signed envelope. It is self-consistent (the
 * harness both wraps and unwraps) and never needs interop with the client SDK,
 * since the server only ever stores opaque envelopes.
 */

import {
	createCipheriv,
	createDecipheriv,
	createPrivateKey,
	createPublicKey,
	diffieHellman,
	sign as edSign,
	verify as edVerify,
	generateKeyPairSync,
	hkdfSync,
	type KeyObject,
	randomBytes,
} from "node:crypto";
import {
	getTranslator,
	initI18n,
	type SupportedLanguage,
} from "@pssmngr/server";
import * as schema from "@pssmngr/server/db/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";
import postgres from "postgres";

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

let sql: ReturnType<typeof postgres> | undefined;
let testDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

function resolveTestUrl(): string {
	if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
	const base = process.env.DATABASE_URL;
	if (base) return base.replace(/\/[^/]+(\?.*)?$/, "/pssmngr_test$1");
	return "postgres://pssmngr:pssmngr_dev@localhost:55781/pssmngr_test"; // gitleaks:allow -- fixed local test credential
}

export async function setupTestDb() {
	await initI18n();
	const url = resolveTestUrl();
	sql = postgres(url, { max: 1, onnotice: () => {} });
	testDb = drizzle(sql, { schema });
	return testDb;
}

export function getTestDb() {
	if (!testDb) {
		throw new Error("Test DB not initialized. Call setupTestDb() first.");
	}
	return testDb;
}

export async function teardownTestDb() {
	if (sql) {
		await sql.end();
		sql = undefined;
		testDb = undefined;
	}
}

/**
 * Truncate every table the family workflow touches, in FK-safe order.
 * `pssmngr_test` is a dedicated, data-free schema clone, so a broad wipe is
 * safe and keeps each test fully isolated.
 */
export async function cleanupFamilyData() {
	getTestDb();
	const tables = [
		"shared_vault_item",
		"shared_vault_member",
		"shared_vault",
		"recovery_request",
		"item_version",
		"item",
		"vault",
		"notification",
		"invitation",
		"member",
		"device",
		"organization",
		"session_temp",
		"account",
		'"user"',
	];
	for (const tableName of tables) {
		await getSql().unsafe(`TRUNCATE TABLE ${tableName} CASCADE`);
	}
}

function getSql() {
	if (!sql) throw new Error("Test DB not initialized");
	return sql;
}

// ---------------------------------------------------------------------------
// Crypto helpers (node:crypto, self-consistent)
// ---------------------------------------------------------------------------

const WRAP_INFO = Buffer.from("pssmngr-shared-vault-v1");
const HKDF_SALT = Buffer.alloc(0);
const AEAD = "chacha20-poly1305";

export interface MemberCrypto {
	x25519: { publicKey: KeyObject; privateKey: KeyObject; rawPub: string };
	ed25519: { publicKey: KeyObject; privateKey: KeyObject; rawPub: string };
}

export function b64(u8: Uint8Array | Buffer): string {
	return Buffer.from(u8).toString("base64");
}
export function u8(b: string): Buffer {
	return Buffer.from(b, "base64");
}

function rawOf(key: KeyObject): string {
	// OKP JWK exposes the raw 32-byte key as base64url in `x` (public) / `d` (private)
	const jwk = key.export({ format: "jwk" }) as { x?: string; d?: string };
	return jwk.x ?? jwk.d ?? "";
}

export function importX25519Public(rawB64Url: string): KeyObject {
	return createPublicKey({
		key: { kty: "OKP", crv: "X25519", x: rawB64Url },
		format: "jwk",
	});
}

export function generateMemberCrypto(): MemberCrypto {
	const x = generateKeyPairSync("x25519");
	const e = generateKeyPairSync("ed25519");
	return {
		x25519: {
			publicKey: x.publicKey,
			privateKey: x.privateKey,
			rawPub: rawOf(x.publicKey),
		},
		ed25519: {
			publicKey: e.publicKey,
			privateKey: e.privateKey,
			rawPub: rawOf(e.publicKey),
		},
	};
}

export function generateVaultKey(): Buffer {
	return randomBytes(32);
}

function deriveWrapKey(shared: Buffer): Buffer {
	return Buffer.from(hkdfSync("sha256", shared, HKDF_SALT, WRAP_INFO, 32));
}

export interface WrappedEnvelope {
	wrappedKey: string;
	wrappedKeyNonce: string;
	wrappedKeyAuthTag: string;
	ephemeralPublicKey: string;
	senderSignature: string;
}

/** Wrap a vault key for a recipient (ECDH + AEAD + Ed25519 signature). */
export function wrapVaultKey(
	vaultKey: Buffer,
	sender: MemberCrypto,
	recipientX25519Pub: KeyObject,
): WrappedEnvelope {
	const ephemeral = generateKeyPairSync("x25519");
	const shared = diffieHellman({
		privateKey: ephemeral.privateKey,
		publicKey: recipientX25519Pub,
	});
	const wrapKey = deriveWrapKey(shared);
	const nonce = randomBytes(12);
	const cipher = createCipheriv(AEAD, wrapKey, nonce, { authTagLength: 16 });
	const wrapped = Buffer.concat([cipher.update(vaultKey), cipher.final()]);
	const authTag = cipher.getAuthTag();
	const ephemeralPublicKey = Buffer.from(
		rawOf(ephemeral.publicKey),
		"base64url",
	);
	const payload = Buffer.concat([wrapped, nonce, authTag, ephemeralPublicKey]);
	const signature = edSign(null, payload, sender.ed25519.privateKey);
	return {
		wrappedKey: b64(wrapped),
		wrappedKeyNonce: b64(nonce),
		wrappedKeyAuthTag: b64(authTag),
		ephemeralPublicKey: b64(ephemeralPublicKey),
		senderSignature: b64(signature),
	};
}

/**
 * Unwrap a vault key from an envelope (as returned by `sharedVault.get`).
 * Verifies the Ed25519 signature with the sender's public key, then
 * ECDH-decrypts. Throws on tamper / wrong recipient.
 */
export function unwrapVaultKey(
	env: WrappedEnvelope,
	recipientX25519Priv: KeyObject,
	senderEd25519Pub: KeyObject,
): Buffer {
	const wrapped = u8(env.wrappedKey);
	const nonce = u8(env.wrappedKeyNonce);
	const authTag = u8(env.wrappedKeyAuthTag);
	const ephemeralPublicKey = u8(env.ephemeralPublicKey);
	const signature = u8(env.senderSignature);

	const payload = Buffer.concat([wrapped, nonce, authTag, ephemeralPublicKey]);
	if (!edVerify(null, payload, senderEd25519Pub, signature)) {
		throw new Error("envelope signature verification failed");
	}

	const senderPub = importX25519Public(
		ephemeralPublicKey.toString("base64url"),
	);
	const shared = diffieHellman({
		privateKey: recipientX25519Priv,
		publicKey: senderPub,
	});
	const wrapKey = deriveWrapKey(shared);
	const decipher = createDecipheriv(AEAD, wrapKey, nonce, {
		authTagLength: 16,
	});
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(wrapped), decipher.final()]);
}

export interface EncryptedItem {
	ciphertext: string;
	nonce: string;
	authTag: string;
	wrappedDataKey: string;
	wrappedDataKeyNonce: string;
	wrappedDataKeyAuthTag: string;
}

/** Encrypt an item with a fresh data key, wrapping the data key under the vault key. */
export function encryptItem(
	vaultKey: Buffer,
	plaintext: string,
): EncryptedItem {
	const dataKey = randomBytes(32);

	const nonce = randomBytes(12);
	const c = createCipheriv(AEAD, dataKey, nonce, { authTagLength: 16 });
	const ciphertext = Buffer.concat([
		c.update(Buffer.from(plaintext, "utf8")),
		c.final(),
	]);
	const authTag = c.getAuthTag();

	const wNonce = randomBytes(12);
	const w = createCipheriv(AEAD, vaultKey, wNonce, { authTagLength: 16 });
	const wrappedDataKey = Buffer.concat([w.update(dataKey), w.final()]);
	const wrappedAuthTag = w.getAuthTag();

	return {
		ciphertext: b64(ciphertext),
		nonce: b64(nonce),
		authTag: b64(authTag),
		wrappedDataKey: b64(wrappedDataKey),
		wrappedDataKeyNonce: b64(wNonce),
		wrappedDataKeyAuthTag: b64(wrappedAuthTag),
	};
}

/** Decrypt an item using the vault key. Throws if the vault key is wrong. */
export function decryptItem(vaultKey: Buffer, item: EncryptedItem): string {
	const wd = createDecipheriv(AEAD, vaultKey, u8(item.wrappedDataKeyNonce), {
		authTagLength: 16,
	});
	wd.setAuthTag(u8(item.wrappedDataKeyAuthTag));
	const dataKey = Buffer.concat([
		wd.update(u8(item.wrappedDataKey)),
		wd.final(),
	]);

	const d = createDecipheriv(AEAD, dataKey, u8(item.nonce), {
		authTagLength: 16,
	});
	d.setAuthTag(u8(item.authTag));
	const plain = Buffer.concat([d.update(u8(item.ciphertext)), d.final()]);
	return plain.toString("utf8");
}

/** Detached Ed25519 signature over a message (used by recovery proof tests). */
export function signMessage(message: Buffer, ed25519Priv: KeyObject): string {
	return b64(edSign(null, message, ed25519Priv));
}

export { createPrivateKey };

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export interface TestUser {
	id: string;
	email: string;
	name: string;
	crypto: MemberCrypto;
}

let emailCounter = 0;
export function uniqueEmail(prefix = "fam"): string {
	emailCounter += 1;
	return `${prefix}-${nanoid(8)}-${emailCounter}@test.local`;
}

/** Insert a user + enrolled device with a fresh keypair. */
export async function createUser(
	opts: { email?: string; name?: string } = {},
): Promise<TestUser> {
	const db = getTestDb();
	const email = opts.email ?? uniqueEmail();
	const name = opts.name ?? "Test User";
	const crypto = generateMemberCrypto();

	const [row] = await db
		.insert(schema.user)
		.values({
			id: nanoid(),
			email,
			name,
			emailVerified: true,
			updatedAt: new Date(),
			ownerId: "",
		})
		.returning();

	await db.insert(schema.device).values({
		userId: row!.id,
		deviceName: "test-device",
		deviceType: "browser",
		publicKey: Buffer.from(crypto.x25519.rawPub, "base64url").toString(
			"base64",
		),
		trusted: true,
	});

	return { id: row!.id, email, name, crypto };
}

/**
 * Build a minimal tRPC context for a user. `role` is the better-auth platform
 * role (defaults to "member"); family/org roles live in the `member` table.
 */
export function makeCtx(
	user: TestUser,
	opts: { language?: SupportedLanguage; activeOrganizationId?: string } = {},
) {
	const language = opts.language ?? "en";
	return {
		db: getTestDb(),
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			role: "member" as const,
			ownerId: "",
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		session: {
			id: `session-${user.id}`,
			userId: user.id,
			activeOrganizationId: opts.activeOrganizationId ?? "",
			token: `token-${user.id}`,
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
			createdAt: new Date(),
			updatedAt: new Date(),
			ipAddress: "127.0.0.1",
			userAgent: "vitest",
		},
		language,
		t: getTranslator(language),
		req: { headers: {} },
		res: { setHeader: () => {} },
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

/** Directly insert a member row (bypasses the invite→accept flow). */
export async function joinOrg(
	organizationId: string,
	userId: string,
	role: "owner" | "admin" | "member" = "member",
) {
	const db = getTestDb();
	const [row] = await db
		.insert(schema.member)
		.values({ organizationId, userId, role, createdAt: new Date() })
		.returning();
	return row!;
}

/** Look up a family member row id for (orgId, userId). */
export async function memberIdOf(organizationId: string, userId: string) {
	const db = getTestDb();
	const rows = await db.query.member.findMany({
		where: (m, { and, eq }) =>
			and(eq(m.organizationId, organizationId), eq(m.userId, userId)),
	});
	return rows[0]?.id;
}

export const testSetup = {
	beforeAll: async () => {
		await setupTestDb();
	},
	afterAll: async () => {
		await teardownTestDb();
	},
	beforeEach: async () => {
		await cleanupFamilyData();
	},
};
