// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Test context helpers for tRPC router integration tests.
 *
 * Creates mock contexts for different user roles and authentication states.
 */

import {
	getTranslator,
	initI18n,
	type SupportedLanguage,
} from "@pssmngr/server/i18n";
import type { TFunction } from "i18next";

/** User role types matching the tRPC context */
type UserRole = "owner" | "admin" | "member";

/** Session type matching the tRPC context */
interface TestSession {
	id: string;
	activeOrganizationId: string;
	impersonatedBy?: string;
}

/** User type matching the tRPC context */
interface TestUser {
	id: string;
	email: string;
	role: UserRole;
	ownerId: string;
	/** Legacy role field used in some routers */
	rol?: UserRole;
}

/** Mock request object */
interface MockRequest {
	headers: Record<string, string | undefined>;
}

/** Mock response object */
interface MockResponse {
	setHeader: (name: string, value: string) => void;
}

/** Test context options */
export interface TestContextOptions {
	/** User ID (default: 'test-user-id') */
	userId?: string;
	/** User email (default: 'test@example.com') */
	email?: string;
	/** User role (default: 'member') */
	role?: UserRole;
	/** Owner ID (default: 'test-owner-id') */
	ownerId?: string;
	/** Organization ID (default: 'test-org-id') */
	organizationId?: string;
	/** Language for translations (default: 'en') */
	language?: SupportedLanguage;
}

/** Test context type matching the tRPC context */
export interface TestContext {
	session: TestSession | null;
	user: (TestUser & { rol: UserRole }) | null;
	language: SupportedLanguage;
	t: TFunction;
	req: MockRequest;
	res: MockResponse;
	db: unknown;
}

// Store translator cache
const translatorCache = new Map<SupportedLanguage, TFunction>();

/**
 * Initialize i18n for tests (call once in beforeAll)
 */
export async function initTestI18n(): Promise<void> {
	await initI18n();
}

/**
 * Get cached translator for a language
 */
function getCachedTranslator(language: SupportedLanguage): TFunction {
	if (!translatorCache.has(language)) {
		translatorCache.set(language, getTranslator(language));
	}
	return translatorCache.get(language)!;
}

/**
 * Create a test context with specified options.
 *
 * @example
 * const ctx = createTestContext({ role: 'admin', language: 'ar' });
 */
export function createTestContext(
	options: TestContextOptions = {},
): TestContext {
	const {
		userId = "test-user-id",
		email = "test@example.com",
		role = "member",
		ownerId = "test-owner-id",
		organizationId = "test-org-id",
		language = "en",
	} = options;

	const user: TestUser & { rol: UserRole } = {
		id: userId,
		email,
		role,
		ownerId,
		rol: role, // Legacy field
	};

	const session: TestSession = {
		id: `session-${userId}`,
		activeOrganizationId: organizationId,
	};

	return {
		session,
		user,
		language,
		t: getCachedTranslator(language),
		req: { headers: { "accept-language": language } },
		res: { setHeader: () => {} },
		db: {}, // Mock DB - individual tests should mock specific queries
	};
}

/**
 * Create an admin context (owner or admin role).
 */
export function createAdminContext(
	options: Omit<TestContextOptions, "role"> = {},
): TestContext {
	return createTestContext({
		...options,
		userId: options.userId ?? "admin-user-id",
		email: options.email ?? "admin@example.com",
		role: "admin",
	});
}

/**
 * Create an owner context.
 */
export function createOwnerContext(
	options: Omit<TestContextOptions, "role"> = {},
): TestContext {
	return createTestContext({
		...options,
		userId: options.userId ?? "owner-user-id",
		email: options.email ?? "owner@example.com",
		role: "owner",
	});
}

/**
 * Create a member context.
 */
export function createMemberContext(
	options: Omit<TestContextOptions, "role"> = {},
): TestContext {
	return createTestContext({
		...options,
		userId: options.userId ?? "member-user-id",
		email: options.email ?? "member@example.com",
		role: "member",
	});
}

/**
 * Create an unauthenticated context (no user/session).
 */
export function createUnauthenticatedContext(
	options: Pick<TestContextOptions, "language"> = {},
): TestContext {
	const language = options.language ?? "en";

	return {
		session: null,
		user: null,
		language,
		t: getCachedTranslator(language),
		req: { headers: { "accept-language": language } },
		res: { setHeader: () => {} },
		db: {},
	};
}

/**
 * Create a context for a specific organization.
 */
export function createContextForOrg(
	organizationId: string,
	options: TestContextOptions = {},
): TestContext {
	return createTestContext({
		...options,
		organizationId,
	});
}
