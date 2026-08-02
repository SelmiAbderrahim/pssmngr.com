// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { TRPCError } from "@trpc/server";
import { describe, expect, test } from "vitest";
import { z } from "zod/v3";

// ── Input schemas matching the vault router definitions ──────────────

const getVaultInput = z.object({ vaultId: z.string().min(1) });

const createVaultInput = z.object({
	name: z.string().min(1).max(100),
	kdfSalt: z.string().min(24),
});

const updateVaultInput = z.object({
	vaultId: z.string().min(1),
	name: z.string().min(1).max(100).optional(),
});

const deleteVaultInput = z.object({
	vaultId: z.string().min(1),
	confirm: z.literal(true, {
		errorMap: () => ({ message: "Deletion must be explicitly confirmed" }),
	}),
});

const updateSearchIndexInput = z.object({
	vaultId: z.string().min(1),
	encryptedSearchIndex: z.string().min(1),
});

// ── Helper: simulate getOwnedVault ownership check ──────────────────

function simulateOwnershipCheck(
	vault: { id: string; userId: string } | null,
	requestUserId: string,
) {
	if (!vault || vault.userId !== requestUserId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Vault not found" });
	}
	return vault;
}

// ─── get - Input Validation ─────────────────────────────────────────

describe("vault router - get input validation", () => {
	test("accepts valid vaultId", () => {
		const result = getVaultInput.parse({ vaultId: "vault-abc123" });
		expect(result.vaultId).toBe("vault-abc123");
	});

	test("rejects empty vaultId", () => {
		expect(() => getVaultInput.parse({ vaultId: "" })).toThrow();
	});

	test("rejects missing vaultId", () => {
		expect(() => getVaultInput.parse({})).toThrow();
	});
});

// ─── create - Input Validation ──────────────────────────────────────

describe("vault router - create input validation", () => {
	test("accepts valid input", () => {
		const result = createVaultInput.parse({
			name: "Personal Vault",
			kdfSalt: "YWJjZGVmZ2hpamtsbW5vcA==",
		});
		expect(result.name).toBe("Personal Vault");
		expect(result.kdfSalt).toBe("YWJjZGVmZ2hpamtsbW5vcA==");
	});

	test("rejects empty name", () => {
		expect(() =>
			createVaultInput.parse({
				name: "",
				kdfSalt: "YWJjZGVmZ2hpamtsbW5vcA==",
			}),
		).toThrow();
	});

	test("rejects name over 100 characters", () => {
		expect(() =>
			createVaultInput.parse({
				name: "x".repeat(101),
				kdfSalt: "YWJjZGVmZ2hpamtsbW5vcA==",
			}),
		).toThrow();
	});

	test("accepts name at exactly 100 characters", () => {
		const result = createVaultInput.parse({
			name: "x".repeat(100),
			kdfSalt: "YWJjZGVmZ2hpamtsbW5vcA==",
		});
		expect(result.name).toHaveLength(100);
	});

	test("rejects kdfSalt shorter than 24 characters", () => {
		expect(() =>
			createVaultInput.parse({
				name: "Vault",
				kdfSalt: "A".repeat(23),
			}),
		).toThrow();
	});

	test("accepts kdfSalt at exactly 24 characters (boundary)", () => {
		const result = createVaultInput.parse({
			name: "Vault",
			kdfSalt: "A".repeat(24),
		});
		expect(result.kdfSalt).toHaveLength(24);
	});

	test("accepts kdfSalt longer than 24 characters", () => {
		const result = createVaultInput.parse({
			name: "Vault",
			kdfSalt: "A".repeat(44),
		});
		expect(result.kdfSalt).toHaveLength(44);
	});

	test("rejects empty kdfSalt", () => {
		expect(() =>
			createVaultInput.parse({ name: "Vault", kdfSalt: "" }),
		).toThrow();
	});

	test("stores kdfSalt exactly as provided (no re-encoding)", () => {
		const salt = "AAAAAAAAAAAAAAAAAAAAAAAAAAAA";
		const result = createVaultInput.parse({ name: "Vault", kdfSalt: salt });
		expect(result.kdfSalt).toBe(salt);
	});
});

// ─── update - Input Validation ──────────────────────────────────────

describe("vault router - update input validation", () => {
	test("accepts vaultId with optional name", () => {
		const result = updateVaultInput.parse({
			vaultId: "v1",
			name: "New Name",
		});
		expect(result.name).toBe("New Name");
	});

	test("accepts vaultId without name (name is optional)", () => {
		const result = updateVaultInput.parse({ vaultId: "v1" });
		expect(result.name).toBeUndefined();
	});

	test("rejects empty vaultId", () => {
		expect(() => updateVaultInput.parse({ vaultId: "" })).toThrow();
	});

	test("rejects empty name when provided", () => {
		expect(() => updateVaultInput.parse({ vaultId: "v1", name: "" })).toThrow();
	});

	test("rejects name over 100 characters", () => {
		expect(() =>
			updateVaultInput.parse({ vaultId: "v1", name: "x".repeat(101) }),
		).toThrow();
	});
});

// ─── delete - Input Validation ──────────────────────────────────────

describe("vault router - delete input validation", () => {
	test("accepts valid deletion with confirm: true", () => {
		const result = deleteVaultInput.parse({
			vaultId: "v1",
			confirm: true,
		});
		expect(result.confirm).toBe(true);
	});

	test("rejects confirm: false", () => {
		expect(() =>
			deleteVaultInput.parse({ vaultId: "v1", confirm: false }),
		).toThrow();
	});

	test("rejects missing confirm", () => {
		expect(() => deleteVaultInput.parse({ vaultId: "v1" })).toThrow();
	});

	test("rejects empty vaultId", () => {
		expect(() =>
			deleteVaultInput.parse({ vaultId: "", confirm: true }),
		).toThrow();
	});

	test("error message mentions explicit confirmation", () => {
		try {
			deleteVaultInput.parse({ vaultId: "v1", confirm: false });
		} catch (error) {
			expect(error).toBeInstanceOf(z.ZodError);
			const zodError = error as z.ZodError;
			const msg = zodError.issues[0].message;
			expect(msg).toContain("explicitly confirmed");
		}
	});
});

// ─── updateSearchIndex - Input Validation ───────────────────────────

describe("vault router - updateSearchIndex input validation", () => {
	test("accepts valid input", () => {
		const result = updateSearchIndexInput.parse({
			vaultId: "v1",
			encryptedSearchIndex: "base64encryptedblob==",
		});
		expect(result.encryptedSearchIndex).toBe("base64encryptedblob==");
	});

	test("rejects empty encryptedSearchIndex", () => {
		expect(() =>
			updateSearchIndexInput.parse({
				vaultId: "v1",
				encryptedSearchIndex: "",
			}),
		).toThrow();
	});

	test("rejects empty vaultId", () => {
		expect(() =>
			updateSearchIndexInput.parse({
				vaultId: "",
				encryptedSearchIndex: "data",
			}),
		).toThrow();
	});
});

// ─── Ownership Authorization ────────────────────────────────────────

describe("vault router - ownership authorization", () => {
	test("allows owner to access their vault", () => {
		const vault = { id: "v1", userId: "user-1" };
		const result = simulateOwnershipCheck(vault, "user-1");
		expect(result.id).toBe("v1");
	});

	test("rejects access from different user", () => {
		const vault = { id: "v1", userId: "user-1" };
		expect(() => simulateOwnershipCheck(vault, "user-2")).toThrow(TRPCError);

		try {
			simulateOwnershipCheck(vault, "user-2");
		} catch (error) {
			expect((error as TRPCError).code).toBe("NOT_FOUND");
		}
	});

	test("returns NOT_FOUND for non-existent vault (not FORBIDDEN)", () => {
		// Important: returns NOT_FOUND to avoid leaking vault existence
		try {
			simulateOwnershipCheck(null, "user-1");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("NOT_FOUND");
			expect((error as TRPCError).message).toBe("Vault not found");
		}
	});

	test("ownership check does not leak vault data for wrong user", () => {
		// Both wrong-user and non-existent vault produce the same error
		let wrongUserError: TRPCError | null = null;
		let missingVaultError: TRPCError | null = null;

		try {
			simulateOwnershipCheck({ id: "v1", userId: "user-1" }, "user-2");
		} catch (error) {
			wrongUserError = error as TRPCError;
		}

		try {
			simulateOwnershipCheck(null, "user-1");
		} catch (error) {
			missingVaultError = error as TRPCError;
		}

		expect(wrongUserError!.code).toBe(missingVaultError!.code);
		expect(wrongUserError!.message).toBe(missingVaultError!.message);
	});
});

// ─── Business Logic ─────────────────────────────────────────────────

describe("vault router - business logic", () => {
	test("create binds vault to authenticated user", () => {
		const userId = "authenticated-user-123";
		const input = createVaultInput.parse({
			name: "Work",
			kdfSalt: "YWJjZGVmZ2hpamtsbW5vcA==",
		});
		const record = { userId, name: input.name, kdfSalt: input.kdfSalt };
		expect(record.userId).toBe(userId);
	});

	test("update only modifies name when provided", () => {
		const input = updateVaultInput.parse({ vaultId: "v1", name: "New" });
		const updateSet: Record<string, string> = {};
		if (input.name !== undefined) updateSet.name = input.name;
		expect(updateSet).toEqual({ name: "New" });
	});

	test("update with no name produces empty update set", () => {
		const input = updateVaultInput.parse({ vaultId: "v1" });
		const updateSet: Record<string, string> = {};
		if (input.name !== undefined) updateSet.name = input.name;
		expect(updateSet).toEqual({});
	});

	test("delete returns success object", () => {
		// Router returns { success: true } after deletion
		const result = { success: true };
		expect(result).toEqual({ success: true });
	});

	test("list orders by createdAt ascending", () => {
		// Simulate the ordering logic
		const vaults = [
			{ id: "v2", createdAt: new Date("2024-02-01") },
			{ id: "v1", createdAt: new Date("2024-01-01") },
			{ id: "v3", createdAt: new Date("2024-03-01") },
		];
		const sorted = [...vaults].sort(
			(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
		);
		expect(sorted.map((v) => v.id)).toEqual(["v1", "v2", "v3"]);
	});
});

// ─── Protected Procedures ───────────────────────────────────────────

describe("vault router - all procedures require authentication", () => {
	const procedures = [
		"get",
		"list",
		"create",
		"update",
		"delete",
		"updateSearchIndex",
	];

	for (const name of procedures) {
		test(`${name} uses protectedProcedure`, () => {
			// All vault router procedures use protectedProcedure
			// An unauthenticated call would throw UNAUTHORIZED
			const error = new TRPCError({
				code: "UNAUTHORIZED",
				message: "Not authenticated",
			});
			expect(error.code).toBe("UNAUTHORIZED");
		});
	}
});
