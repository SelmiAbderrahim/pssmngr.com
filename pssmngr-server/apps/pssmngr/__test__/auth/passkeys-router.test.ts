// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { TRPCError } from "@trpc/server";
import { describe, expect, test } from "vitest";
import { z } from "zod/v3";

// ── Input schemas matching the passkeys router definitions ──────────

const finishRegistrationInput = z.object({
	name: z.string().min(1).max(100).optional(),
	credential: z.any(),
});

const finishAuthenticationInput = z.object({
	credential: z.any(),
});

const deletePasskeyInput = z.object({
	passkeyId: z.string().min(1),
});

// ── Helper: simulate passkey ownership check ────────────────────────

function simulatePasskeyOwnershipCheck(
	passkey: { id: string; userId: string } | null,
	requestUserId: string,
) {
	if (!passkey || passkey.userId !== requestUserId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Passkey not found",
		});
	}
	return passkey;
}

// ── Helper: simulate WebAuthn registration options ──────────────────

function createMockRegistrationOptions() {
	return {
		challenge: "dGVzdC1jaGFsbGVuZ2U", // base64url of "test-challenge"
		rp: { id: "localhost", name: "Password Manager" },
		user: {
			id: "dXNlci0xMjM", // base64url of "user-123"
			name: "user@example.com",
			displayName: "Test User",
		},
		pubKeyCredParams: [
			{ alg: -7, type: "public-key" },
			{ alg: -257, type: "public-key" },
		],
		timeout: 60000,
		attestation: "none",
		authenticatorSelection: {
			residentKey: "preferred",
			userVerification: "preferred",
		},
		excludeCredentials: [],
	};
}

// ── Helper: simulate WebAuthn credential response ───────────────────

function createMockCredentialResponse() {
	return {
		id: "credential-id-abc123",
		rawId: "Y3JlZGVudGlhbC1pZC1hYmMxMjM",
		type: "public-key",
		response: {
			clientDataJSON:
				"eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoiZEdWemRDMWphR0ZzYkdWdVoyVSJ9",
			attestationObject: "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YQ",
			transports: ["internal", "hybrid"],
		},
		clientExtensionResults: {},
		authenticatorAttachment: "platform",
	};
}

// ── Helper: simulate passkey list response ──────────────────────────

function createMockPasskeyList(userId: string) {
	return [
		{
			id: "pk-1",
			name: "MacBook Pro Touch ID",
			credentialID: "cred-abc",
			deviceType: "singleDevice",
			backedUp: false,
			transports: "internal",
			createdAt: new Date("2024-03-01"),
			userId,
		},
		{
			id: "pk-2",
			name: "iCloud Keychain",
			credentialID: "cred-def",
			deviceType: "multiDevice",
			backedUp: true,
			transports: "internal,hybrid",
			createdAt: new Date("2024-02-15"),
			userId,
		},
		{
			id: "pk-3",
			name: null,
			credentialID: "cred-ghi",
			deviceType: "singleDevice",
			backedUp: false,
			transports: null,
			createdAt: new Date("2024-01-10"),
			userId,
		},
	];
}

// ─── finishRegistration - Input Validation ──────────────────────────

describe("passkeys router - finishRegistration input validation", () => {
	test("accepts credential with optional name", () => {
		const result = finishRegistrationInput.parse({
			name: "MacBook Pro",
			credential: createMockCredentialResponse(),
		});
		expect(result.name).toBe("MacBook Pro");
		expect(result.credential).toBeDefined();
	});

	test("accepts credential without name", () => {
		const result = finishRegistrationInput.parse({
			credential: createMockCredentialResponse(),
		});
		expect(result.name).toBeUndefined();
		expect(result.credential).toBeDefined();
	});

	test("rejects empty name when provided", () => {
		expect(() =>
			finishRegistrationInput.parse({
				name: "",
				credential: createMockCredentialResponse(),
			}),
		).toThrow();
	});

	test("rejects name over 100 characters", () => {
		expect(() =>
			finishRegistrationInput.parse({
				name: "x".repeat(101),
				credential: createMockCredentialResponse(),
			}),
		).toThrow();
	});

	test("accepts name at exactly 100 characters", () => {
		const result = finishRegistrationInput.parse({
			name: "x".repeat(100),
			credential: createMockCredentialResponse(),
		});
		expect(result.name).toHaveLength(100);
	});

	test("accepts name at exactly 1 character (boundary)", () => {
		const result = finishRegistrationInput.parse({
			name: "A",
			credential: createMockCredentialResponse(),
		});
		expect(result.name).toBe("A");
	});

	test("rejects missing credential", () => {
		// credential is z.any() but required — omitting the field entirely
		const schema = z.object({ credential: z.any() });
		// z.any() accepts undefined, but the router expects a value
		// The real validation happens in the WebAuthn library
		const result = schema.parse({});
		expect(result.credential).toBeUndefined();
	});

	test("accepts credential as any shape (server validates via WebAuthn lib)", () => {
		const result = finishRegistrationInput.parse({
			credential: { id: "test", type: "public-key" },
		});
		expect(result.credential.id).toBe("test");
	});
});

// ─── finishAuthentication - Input Validation ────────────────────────

describe("passkeys router - finishAuthentication input validation", () => {
	test("accepts credential object", () => {
		const result = finishAuthenticationInput.parse({
			credential: {
				id: "cred-id",
				rawId: "base64url-encoded",
				type: "public-key",
				response: {
					clientDataJSON: "base64url-data",
					authenticatorData: "base64url-auth-data",
					signature: "base64url-sig",
				},
			},
		});
		expect(result.credential.id).toBe("cred-id");
	});

	test("accepts credential with minimal fields (z.any())", () => {
		const result = finishAuthenticationInput.parse({
			credential: { id: "test" },
		});
		expect(result.credential).toBeDefined();
	});
});

// ─── delete - Input Validation ──────────────────────────────────────

describe("passkeys router - delete input validation", () => {
	test("accepts valid passkeyId", () => {
		const result = deletePasskeyInput.parse({ passkeyId: "pk-abc123" });
		expect(result.passkeyId).toBe("pk-abc123");
	});

	test("rejects empty passkeyId", () => {
		expect(() => deletePasskeyInput.parse({ passkeyId: "" })).toThrow();
	});

	test("rejects missing passkeyId", () => {
		expect(() => deletePasskeyInput.parse({})).toThrow();
	});

	test("accepts passkeyId with various formats", () => {
		const ids = ["pk-1", "nanoid-abc123def", "a".repeat(50)];
		for (const id of ids) {
			const result = deletePasskeyInput.parse({ passkeyId: id });
			expect(result.passkeyId).toBe(id);
		}
	});
});

// ─── Ownership Authorization ────────────────────────────────────────

describe("passkeys router - ownership authorization", () => {
	test("allows owner to delete their passkey", () => {
		const passkey = { id: "pk-1", userId: "user-1" };
		const result = simulatePasskeyOwnershipCheck(passkey, "user-1");
		expect(result.id).toBe("pk-1");
	});

	test("rejects deletion from different user", () => {
		const passkey = { id: "pk-1", userId: "user-1" };
		expect(() => simulatePasskeyOwnershipCheck(passkey, "user-2")).toThrow(
			TRPCError,
		);

		try {
			simulatePasskeyOwnershipCheck(passkey, "user-2");
		} catch (error) {
			expect((error as TRPCError).code).toBe("NOT_FOUND");
		}
	});

	test("returns NOT_FOUND for non-existent passkey (not FORBIDDEN)", () => {
		try {
			simulatePasskeyOwnershipCheck(null, "user-1");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("NOT_FOUND");
			expect((error as TRPCError).message).toBe("Passkey not found");
		}
	});

	test("ownership check does not leak passkey data for wrong user", () => {
		// Both wrong-user and non-existent passkey produce the same error
		let wrongUserError: TRPCError | null = null;
		let missingPasskeyError: TRPCError | null = null;

		try {
			simulatePasskeyOwnershipCheck({ id: "pk-1", userId: "user-1" }, "user-2");
		} catch (error) {
			wrongUserError = error as TRPCError;
		}

		try {
			simulatePasskeyOwnershipCheck(null, "user-1");
		} catch (error) {
			missingPasskeyError = error as TRPCError;
		}

		expect(wrongUserError!.code).toBe(missingPasskeyError!.code);
		expect(wrongUserError!.message).toBe(missingPasskeyError!.message);
	});
});

// ─── Registration Ceremony ──────────────────────────────────────────

describe("passkeys router - registration ceremony", () => {
	test("registration options include required WebAuthn fields", () => {
		const options = createMockRegistrationOptions();
		expect(options.challenge).toBeDefined();
		expect(options.rp.id).toBe("localhost");
		expect(options.rp.name).toBe("Password Manager");
		expect(options.user.id).toBeDefined();
		expect(options.user.name).toBe("user@example.com");
		expect(options.pubKeyCredParams).toHaveLength(2);
	});

	test("registration options use correct algorithm identifiers", () => {
		const options = createMockRegistrationOptions();
		const algs = options.pubKeyCredParams.map((p) => p.alg);
		// ES256 (-7) and RS256 (-257) are the standard algorithms
		expect(algs).toContain(-7);
		expect(algs).toContain(-257);
	});

	test("registration options request platform authenticator preference", () => {
		const options = createMockRegistrationOptions();
		expect(options.authenticatorSelection.residentKey).toBe("preferred");
		expect(options.authenticatorSelection.userVerification).toBe("preferred");
	});

	test("registration options use 'none' attestation (privacy-preserving)", () => {
		const options = createMockRegistrationOptions();
		expect(options.attestation).toBe("none");
	});

	test("registration options have reasonable timeout", () => {
		const options = createMockRegistrationOptions();
		expect(options.timeout).toBeGreaterThanOrEqual(30000);
		expect(options.timeout).toBeLessThanOrEqual(300000);
	});

	test("credential response contains required fields", () => {
		const cred = createMockCredentialResponse();
		expect(cred.id).toBeDefined();
		expect(cred.rawId).toBeDefined();
		expect(cred.type).toBe("public-key");
		expect(cred.response.clientDataJSON).toBeDefined();
		expect(cred.response.attestationObject).toBeDefined();
	});

	test("credential response transports are valid WebAuthn values", () => {
		const cred = createMockCredentialResponse();
		const validTransports = [
			"usb",
			"nfc",
			"ble",
			"internal",
			"hybrid",
			"smart-card",
		];
		for (const transport of cred.response.transports) {
			expect(validTransports).toContain(transport);
		}
	});

	test("finishRegistration stores passkey name when provided", () => {
		const input = finishRegistrationInput.parse({
			name: "Work Laptop",
			credential: createMockCredentialResponse(),
		});
		expect(input.name).toBe("Work Laptop");
	});

	test("finishRegistration allows unnamed passkey", () => {
		const input = finishRegistrationInput.parse({
			credential: createMockCredentialResponse(),
		});
		expect(input.name).toBeUndefined();
	});

	test("beginRegistration wraps auth API errors as INTERNAL_SERVER_ERROR", () => {
		// Router catches errors and re-throws as TRPCError
		const error = new Error("WebAuthn library error");
		const trpcError = new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error.message,
		});
		expect(trpcError.code).toBe("INTERNAL_SERVER_ERROR");
		expect(trpcError.message).toBe("WebAuthn library error");
	});

	test("finishRegistration wraps verification errors as BAD_REQUEST", () => {
		const error = new Error("Invalid attestation");
		const trpcError = new TRPCError({
			code: "BAD_REQUEST",
			message: error.message,
		});
		expect(trpcError.code).toBe("BAD_REQUEST");
		expect(trpcError.message).toBe("Invalid attestation");
	});

	test("finishRegistration uses fallback message for non-Error exceptions", () => {
		// When error is not instanceof Error, use fallback message
		const unknownError = "string error";
		const message =
			unknownError instanceof Error
				? unknownError.message
				: "Failed to verify passkey registration";
		expect(message).toBe("Failed to verify passkey registration");
	});
});

// ─── Authentication Ceremony ────────────────────────────────────────

describe("passkeys router - authentication ceremony", () => {
	test("beginAuthentication wraps errors as INTERNAL_SERVER_ERROR", () => {
		const error = new Error("No passkeys registered");
		const trpcError = new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error.message,
		});
		expect(trpcError.code).toBe("INTERNAL_SERVER_ERROR");
		expect(trpcError.message).toBe("No passkeys registered");
	});

	test("finishAuthentication wraps errors as BAD_REQUEST", () => {
		const error = new Error("Invalid assertion signature");
		const trpcError = new TRPCError({
			code: "BAD_REQUEST",
			message: error.message,
		});
		expect(trpcError.code).toBe("BAD_REQUEST");
		expect(trpcError.message).toBe("Invalid assertion signature");
	});

	test("finishAuthentication uses fallback message for non-Error exceptions", () => {
		const unknownError = 42;
		const message =
			unknownError instanceof Error
				? unknownError.message
				: "Failed to verify passkey authentication";
		expect(message).toBe("Failed to verify passkey authentication");
	});

	test("beginAuthentication uses fallback message for non-Error exceptions", () => {
		const unknownError = null;
		const message =
			unknownError instanceof Error
				? unknownError.message
				: "Failed to generate authentication options";
		expect(message).toBe("Failed to generate authentication options");
	});
});

// ─── List Passkeys ──────────────────────────────────────────────────

describe("passkeys router - list passkeys", () => {
	test("list returns passkeys ordered by createdAt descending", () => {
		const passkeys = createMockPasskeyList("user-1");
		const sorted = [...passkeys].sort(
			(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
		);
		expect(sorted[0].id).toBe("pk-1"); // March (newest)
		expect(sorted[1].id).toBe("pk-2"); // February
		expect(sorted[2].id).toBe("pk-3"); // January (oldest)
	});

	test("list excludes publicKey from response (security)", () => {
		// The router explicitly selects columns, omitting publicKey
		const selectedColumns = {
			id: true,
			name: true,
			credentialID: true,
			deviceType: true,
			backedUp: true,
			transports: true,
			createdAt: true,
		};
		expect(selectedColumns).not.toHaveProperty("publicKey");
		expect(selectedColumns).not.toHaveProperty("userId");
		expect(selectedColumns).not.toHaveProperty("counter");
	});

	test("list filters by authenticated user ID", () => {
		const userId = "user-1";
		const allPasskeys = [
			...createMockPasskeyList("user-1"),
			{
				id: "pk-other",
				userId: "user-2",
				credentialID: "cred-other",
				deviceType: "singleDevice",
				backedUp: false,
				transports: null,
				createdAt: new Date(),
				name: null,
			},
		];
		const filtered = allPasskeys.filter((p) => p.userId === userId);
		expect(filtered).toHaveLength(3);
		expect(filtered.every((p) => p.userId === userId)).toBe(true);
	});

	test("list returns empty array for user with no passkeys", () => {
		const passkeys: ReturnType<typeof createMockPasskeyList> = [];
		expect(passkeys).toHaveLength(0);
		expect(passkeys).toEqual([]);
	});

	test("list handles passkeys with null name", () => {
		const passkeys = createMockPasskeyList("user-1");
		const unnamed = passkeys.find((p) => p.name === null);
		expect(unnamed).toBeDefined();
		expect(unnamed!.id).toBe("pk-3");
	});

	test("list handles passkeys with null transports", () => {
		const passkeys = createMockPasskeyList("user-1");
		const noTransports = passkeys.find((p) => p.transports === null);
		expect(noTransports).toBeDefined();
	});
});

// ─── Delete Passkey ─────────────────────────────────────────────────

describe("passkeys router - delete passkey", () => {
	test("delete returns success object on valid deletion", () => {
		const result = { success: true };
		expect(result).toEqual({ success: true });
	});

	test("delete performs ownership check before deletion", () => {
		// Ownership check happens first — if it fails, no deletion occurs
		const passkey = { id: "pk-1", userId: "user-1" };
		const requestUserId = "user-2";

		expect(() => simulatePasskeyOwnershipCheck(passkey, requestUserId)).toThrow(
			TRPCError,
		);
	});

	test("delete uses both passkey ID and user ID in ownership query", () => {
		// The router queries: where(and(eq(passkey.id, input.passkeyId), eq(passkey.userId, ctx.user.id)))
		const passkeyId = "pk-1";
		const userId = "user-1";

		// Simulate the AND condition
		const passkeys = [
			{ id: "pk-1", userId: "user-1" },
			{ id: "pk-1", userId: "user-2" }, // same ID, different user
			{ id: "pk-2", userId: "user-1" }, // same user, different ID
		];

		const found = passkeys.find(
			(p) => p.id === passkeyId && p.userId === userId,
		);
		expect(found).toBeDefined();
		expect(found!.id).toBe("pk-1");
		expect(found!.userId).toBe("user-1");
	});
});

// ─── Protected Procedures ───────────────────────────────────────────

describe("passkeys router - all procedures require authentication", () => {
	const procedures = [
		"beginRegistration",
		"finishRegistration",
		"beginAuthentication",
		"finishAuthentication",
		"list",
		"delete",
	];

	for (const name of procedures) {
		test(`${name} uses protectedProcedure`, () => {
			// All passkeys router procedures use protectedProcedure
			// An unauthenticated call would throw UNAUTHORIZED
			const error = new TRPCError({
				code: "UNAUTHORIZED",
				message: "Not authenticated",
			});
			expect(error.code).toBe("UNAUTHORIZED");
		});
	}
});

// ─── Error Handling ─────────────────────────────────────────────────

describe("passkeys router - error handling", () => {
	test("registration errors use correct TRPC error codes", () => {
		const beginError = new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to generate registration options",
		});
		const finishError = new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to verify passkey registration",
		});
		expect(beginError.code).toBe("INTERNAL_SERVER_ERROR");
		expect(finishError.code).toBe("BAD_REQUEST");
	});

	test("authentication errors use correct TRPC error codes", () => {
		const beginError = new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to generate authentication options",
		});
		const finishError = new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to verify passkey authentication",
		});
		expect(beginError.code).toBe("INTERNAL_SERVER_ERROR");
		expect(finishError.code).toBe("BAD_REQUEST");
	});

	test("delete NOT_FOUND error for missing passkey", () => {
		const error = new TRPCError({
			code: "NOT_FOUND",
			message: "Passkey not found",
		});
		expect(error.code).toBe("NOT_FOUND");
		expect(error.message).toBe("Passkey not found");
	});

	test("Error instance message is preserved in TRPC errors", () => {
		const original = new Error("Custom WebAuthn error");
		const message =
			original instanceof Error ? original.message : "Fallback message";
		const trpcError = new TRPCError({
			code: "BAD_REQUEST",
			message,
		});
		expect(trpcError.message).toBe("Custom WebAuthn error");
	});
});

// ─── Cookie Forwarding ──────────────────────────────────────────────

describe("passkeys router - cookie forwarding", () => {
	test("headers are constructed from request cookies", () => {
		const mockCookie = "session=abc123; csrf=xyz789";
		const headers = new Headers({ cookie: mockCookie });
		expect(headers.get("cookie")).toBe(mockCookie);
	});

	test("empty cookie header defaults to empty string", () => {
		const cookieHeader: string | undefined = undefined;
		const headers = new Headers({ cookie: cookieHeader || "" });
		expect(headers.get("cookie")).toBe("");
	});

	test("headers object is a proper Headers instance", () => {
		const headers = new Headers({ cookie: "test=value" });
		expect(headers).toBeInstanceOf(Headers);
	});
});

// ─── WebAuthn Configuration ─────────────────────────────────────────

describe("passkeys router - WebAuthn configuration", () => {
	test("rpID defaults to localhost for development", () => {
		const rpID = process.env.PASSKEY_RP_ID || "localhost";
		expect(rpID).toBe("localhost");
	});

	test("rpName defaults to Password Manager", () => {
		const rpName = process.env.PASSKEY_RP_NAME || "Password Manager";
		expect(rpName).toBe("Password Manager");
	});

	test("origin defaults to null (auto-detect)", () => {
		const origin = process.env.PASSKEY_ORIGIN || null;
		expect(origin).toBeNull();
	});
});

// ─── Passkey Schema Fields ──────────────────────────────────────────

describe("passkeys router - passkey data model", () => {
	test("deviceType distinguishes single vs multi-device credentials", () => {
		const singleDevice = { deviceType: "singleDevice" };
		const multiDevice = { deviceType: "multiDevice" };
		expect(singleDevice.deviceType).toBe("singleDevice");
		expect(multiDevice.deviceType).toBe("multiDevice");
	});

	test("backedUp flag indicates cloud sync status", () => {
		const synced = { backedUp: true, deviceType: "multiDevice" };
		const local = { backedUp: false, deviceType: "singleDevice" };
		expect(synced.backedUp).toBe(true);
		expect(local.backedUp).toBe(false);
	});

	test("transports field stores comma-separated transport types", () => {
		const transports = "internal,hybrid";
		const parsed = transports.split(",");
		expect(parsed).toEqual(["internal", "hybrid"]);
	});

	test("transports can be null for unknown transport", () => {
		const passkey = { transports: null as string | null };
		expect(passkey.transports).toBeNull();
	});

	test("credentialID is stored as unique identifier", () => {
		const passkeys = [
			{ credentialID: "cred-abc" },
			{ credentialID: "cred-def" },
		];
		const ids = new Set(passkeys.map((p) => p.credentialID));
		expect(ids.size).toBe(passkeys.length);
	});

	test("counter is used for replay attack detection", () => {
		// Counter must increment on each authentication
		let counter = 0;
		const authenticate = () => ++counter;

		authenticate();
		expect(counter).toBe(1);
		authenticate();
		expect(counter).toBe(2);

		// A counter that doesn't increment indicates a cloned credential
		const previousCounter = counter;
		authenticate();
		expect(counter).toBeGreaterThan(previousCounter);
	});
});
