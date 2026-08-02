// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Manual type definitions for i18n.
 *
 * This file provides type exports and fallback types for when
 * the generated types file doesn't exist yet.
 *
 * For full compile-time checking of all translation keys,
 * run `pnpm run i18n:generate-types` to generate types.generated.ts
 *
 * @module i18n/types
 */

// Re-export generated types (primary source of truth)
export * from "./types.generated";

// =============================================================================
// Common Interpolation Variables
// =============================================================================

/**
 * Common parameters used across multiple translation keys.
 * These are the most frequently used interpolation variables.
 */
export interface CommonParams {
	/** Resource name (e.g., 'Project', 'Database') */
	resource?: string;
	/** Service name (e.g., 'PostgreSQL', 'Redis') */
	service?: string;
	/** Entity ID */
	id?: string;
	/** Entity name */
	name?: string;
	/** Count for pluralization */
	count?: number;
	/** Minimum value */
	min?: number;
	/** Maximum value */
	max?: number;
	/** Current value */
	current?: number;
}

/**
 * Email-specific interpolation parameters.
 */
export interface EmailParams {
	/** Recipient's name */
	name?: string;
	/** Application name */
	appName?: string;
	/** Organization name */
	organization?: string;
	/** Inviter's name */
	inviter?: string;
	/** User role */
	role?: string;
	/** Number of days until expiry */
	days?: number;
	/** Number of hours until expiry */
	hours?: number;
	/** Support email address */
	supportEmail?: string;
	/** Service name for notifications */
	serviceName?: string;
	/** Deployment status */
	status?: string;
	/** Duration (formatted) */
	duration?: string;
	/** Alert name */
	alertName?: string;
}

// =============================================================================
// Type-Safe Translation Function
// =============================================================================

/**
 * Type-safe translation function signature.
 *
 * This is a more permissive type for use when the generated types
 * are not available or when working with dynamic keys.
 */
export type TypedTFunction = <K extends string>(
	key: K,
	params?: CommonParams & EmailParams & Record<string, string | number>,
) => string;

// =============================================================================
// Translation Context Type
// =============================================================================

/**
 * Interface for translation context passed through tRPC procedures.
 * This matches the ctx.t type used in procedures.
 */
export interface TranslationContext {
	/** The translation function bound to the user's language */
	t: TypedTFunction;
	/** The detected/requested language */
	language: string;
}

// =============================================================================
// Error Message Helpers
// =============================================================================

/**
 * Helper type for error messages with common structure.
 */
export interface ErrorMessage {
	code: string;
	message: string;
	params?: Record<string, string | number>;
}

/**
 * Create a typed error message object.
 */
export function createErrorMessage(
	key: string,
	params?: Record<string, string | number>,
): ErrorMessage {
	return {
		code: key,
		message: key,
		params,
	};
}
