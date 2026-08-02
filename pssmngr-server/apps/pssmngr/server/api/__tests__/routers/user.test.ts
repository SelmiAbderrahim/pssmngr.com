// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userRouter } from "../../routers/user";

const {
	mockGetSystemEmailProvider,
	mockIsCloud,
	mockIsEmailConfigured,
	mockDb,
	mockReturning,
	mockUpdateSet,
	mockUpdateWhere,
} = vi.hoisted(() => {
	const returning = vi.fn().mockResolvedValue([{}]);
	const updateWhere = vi.fn(() => ({ returning }));
	const updateSet = vi.fn(() => ({ where: updateWhere }));
	return {
		mockGetSystemEmailProvider: vi.fn(),
		mockIsCloud: { value: false },
		mockIsEmailConfigured: vi.fn().mockReturnValue(false),
		mockReturning: returning,
		mockUpdateSet: updateSet,
		mockUpdateWhere: updateWhere,
		mockDb: {
			query: {
				invitation: {
					findFirst: vi.fn().mockResolvedValue(null),
					findMany: vi.fn().mockResolvedValue([]),
				},
				member: {
					findFirst: vi.fn().mockResolvedValue(null),
					findMany: vi.fn().mockResolvedValue([]),
				},
				organization: { findFirst: vi.fn().mockResolvedValue(null) },
				user: { findFirst: vi.fn().mockResolvedValue(null) },
			},
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					where: vi.fn().mockResolvedValue([{ total: 0 }]),
				})),
			})),
			update: vi.fn(() => ({ set: updateSet })),
		},
	};
});

vi.mock("@/server/db", () => ({ db: mockDb }));
vi.mock("@pssmngr/server/db", () => ({ db: mockDb }));

vi.mock("@pssmngr/server/lib/auth", () => ({ validateRequest: vi.fn() }));

vi.mock("@/server/utils/site-url", () => ({
	WEBSITE_URL: "http://localhost:42789",
}));

vi.mock("@pssmngr/server", () => ({
	badRequestError: (_t: unknown, key: string) =>
		new TRPCError({ code: "BAD_REQUEST", message: key }),
	getEffectiveLanguage: vi.fn().mockReturnValue("en"),
	getSystemEmailProvider: (...args: unknown[]) =>
		mockGetSystemEmailProvider(...args),
	getTranslator: vi.fn().mockReturnValue((key: string) => key),
	getUserEmailLanguage: vi.fn().mockResolvedValue("en"),
	internalError: () =>
		new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Internal error" }),
	isEmailConfigured: (...args: unknown[]) => mockIsEmailConfigured(...args),
	get IS_CLOUD() {
		return mockIsCloud.value;
	},
	notFoundError: (_t: unknown, resource: string) =>
		new TRPCError({ code: "NOT_FOUND", message: `Not found: ${resource}` }),
	permissionError: (_t: unknown, key: string) =>
		new TRPCError({ code: "FORBIDDEN", message: key }),
	renderLocalizedEmail: vi.fn().mockResolvedValue({
		subject: "Invitation",
		html: "<p>Invitation</p>",
		text: "Invitation",
	}),
	unauthorizedError: (_t: unknown, resource: string) =>
		new TRPCError({
			code: "UNAUTHORIZED",
			message: `Unauthorized: ${resource}`,
		}),
	updateFailedError: (_t: unknown, resource: string) =>
		new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to update ${resource}`,
		}),
}));

function createCtx(
	userId = "user-1",
	role: "member" | "admin" | "owner" = "member",
) {
	return {
		db: mockDb,
		language: "en",
		req: { headers: {} },
		res: { setHeader: vi.fn() },
		session: {
			id: `session-${userId}`,
			activeOrganizationId: "org-1",
		},
		t: ((key: string) => key) as any,
		user: {
			id: userId,
			email: `${userId}@test.com`,
			name: userId,
			ownerId: "owner-1",
			role,
		},
	};
}

function createCaller(ctx = createCtx()) {
	return userRouter.createCaller(ctx as any);
}

describe("User Router", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsCloud.value = false;
		mockIsEmailConfigured.mockReturnValue(false);
		mockReturning.mockResolvedValue([{}]);
		mockDb.query.invitation.findFirst.mockResolvedValue(null);
		mockDb.query.invitation.findMany.mockResolvedValue([]);
		mockDb.query.member.findFirst.mockResolvedValue(null);
		mockDb.query.member.findMany.mockResolvedValue([]);
		mockDb.query.organization.findFirst.mockResolvedValue(null);
		mockDb.query.user.findFirst.mockResolvedValue(null);
	});

	describe("profile", () => {
		it("updates only non-authentication profile fields", async () => {
			const updated = {
				id: "user-1",
				name: "Jane",
				image: "https://example.test/avatar.png",
			};
			mockReturning.mockResolvedValue([updated]);

			const result = await createCaller().updateProfile({
				name: "Jane",
				image: "https://example.test/avatar.png",
			});

			expect(result).toEqual(updated);
			expect(mockUpdateSet).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "Jane",
					image: "https://example.test/avatar.png",
					updatedAt: expect.any(Date),
				}),
			);
			expect(mockUpdateWhere).toHaveBeenCalledOnce();
		});

		it("rejects password and email fields at the schema boundary", async () => {
			await expect(
				createCaller().updateProfile({
					name: "Jane",
					password: "must-never-reach-this-router",
				} as any),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });

			await expect(
				createCaller().updateProfile({
					name: "Jane",
					email: "changed@example.test",
				} as any),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(mockUpdateSet).not.toHaveBeenCalled();
		});

		it("fails closed when the user row was not updated", async () => {
			mockReturning.mockResolvedValue([]);

			await expect(
				createCaller().updateProfile({ name: "Jane" }),
			).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		});
	});

	describe("organization-scoped reads", () => {
		it("returns the caller's active-organization member record", async () => {
			mockDb.query.member.findFirst.mockResolvedValue({
				id: "member-1",
				userId: "user-1",
				user: { id: "user-1", name: "Jane", lastName: "Doe" },
			});

			const result = await createCaller().get();

			expect(result).toMatchObject({
				id: "user-1",
				userId: "user-1",
				user: { firstName: "Jane", lastName: "Doe" },
			});
		});

		it("does not disclose another member to a normal user", async () => {
			mockDb.query.member.findFirst.mockResolvedValue({
				id: "member-2",
				userId: "user-2",
				user: { id: "user-2", name: "Other", lastName: "" },
			});

			await expect(
				createCaller().one({ userId: "user-2" }),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		});

		it("returns NOT_FOUND instead of leaking absent cross-org users", async () => {
			mockDb.query.member.findFirst.mockResolvedValue(null);

			await expect(
				createCaller().one({ userId: "unknown" }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});
	});

	describe("preferences", () => {
		it("reads and updates language", async () => {
			mockDb.query.user.findFirst.mockResolvedValue({
				preferredLanguage: "fr",
			});

			await expect(createCaller().getLanguage()).resolves.toBe("fr");
			await expect(
				createCaller().updateLanguage({ preferredLanguage: "de" }),
			).resolves.toEqual({ success: true });
			expect(mockUpdateSet).toHaveBeenCalledWith({ preferredLanguage: "de" });
		});

		it("uses a safe default and updates layout", async () => {
			mockDb.query.user.findFirst.mockResolvedValue({ layoutTemplate: null });

			await expect(createCaller().getLayoutTemplate()).resolves.toBe("default");
			await expect(
				createCaller().updateLayoutTemplate({ layoutTemplate: "compact" }),
			).resolves.toEqual({ success: true });
			expect(mockUpdateSet).toHaveBeenCalledWith({ layoutTemplate: "compact" });
		});

		it("defaults the guide on and persists an explicit choice", async () => {
			mockDb.query.user.findFirst.mockResolvedValue({ guideMe: null });

			await expect(createCaller().getGuideMe()).resolves.toBe(true);
			await expect(
				createCaller().updateGuideMe({ guideMe: false }),
			).resolves.toEqual({ success: true });
			expect(mockUpdateSet).toHaveBeenCalledWith({ guideMe: false });
		});
	});
});
