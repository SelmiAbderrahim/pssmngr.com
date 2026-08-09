// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Shared Pagination Utilities
 *
 * Provides reusable pagination schema, types, and helper functions
 * for all listing endpoints in the Password Manager API.
 *
 * @module utils/pagination
 */

import { z } from "zod/v3";

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Base pagination input schema
 * Use with .merge() to combine with entity-specific schemas
 *
 * @example
 * const apiGetDeployments = z.object({
 *   applicationId: z.string(),
 * }).merge(paginationInputSchema);
 */
export const paginationInputSchema = z.object({
	/** Current page number (1-indexed) */
	page: z.number().int().min(1).default(1),
	/** Items per page (max 100) */
	limit: z.number().int().min(1).max(100).default(20),
	/** Search query (optional) */
	search: z.string().optional(),
	/** Column to sort by */
	sortBy: z.string().default("createdAt"),
	/** Sort direction */
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * Type inference from pagination schema
 */
export type PaginationInput = z.infer<typeof paginationInputSchema>;

// ============================================================================
// Response Types
// ============================================================================

/**
 * Pagination metadata included in responses
 */
export interface PaginationMeta {
	/** Current page number */
	page: number;
	/** Items per page */
	limit: number;
	/** Total number of items */
	total: number;
	/** Total number of pages */
	totalPages: number;
}

/**
 * Generic paginated response wrapper
 * Use as return type for all listing procedures
 *
 * @example
 * type DeploymentsResponse = PaginatedResponse<Deployment>;
 */
export interface PaginatedResponse<T> {
	/** Array of items for current page */
	data: T[];
	/** Pagination metadata */
	pagination: PaginationMeta;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate offset for SQL OFFSET clause
 *
 * @param page - Current page number (1-indexed)
 * @param limit - Items per page
 * @returns Offset value for database query
 *
 * @example
 * const offset = calculateOffset(3, 20); // Returns 40
 */
export function calculateOffset(page: number, limit: number): number {
	return (page - 1) * limit;
}

/**
 * Create a standardized paginated response
 *
 * @param data - Array of items for current page
 * @param total - Total number of items (from COUNT query)
 * @param page - Current page number
 * @param limit - Items per page
 * @returns Formatted paginated response
 *
 * @example
 * const response = createPaginatedResponse(users, 150, 1, 20);
 * // { data: [...], pagination: { page: 1, limit: 20, total: 150, totalPages: 8 } }
 */
export function createPaginatedResponse<T>(
	data: T[],
	total: number,
	page: number,
	limit: number,
): PaginatedResponse<T> {
	return {
		data,
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
}

/**
 * Build LIKE pattern for search queries
 * Escapes special characters and wraps in wildcards
 *
 * @param search - User search input
 * @returns Safe LIKE pattern
 *
 * @example
 * const pattern = buildSearchPattern("john%"); // Returns "%john\\%%"
 */
export function buildSearchPattern(search: string): string {
	// Escape SQL LIKE special characters
	const escaped = search
		.replace(/\\/g, "\\\\")
		.replace(/%/g, "\\%")
		.replace(/_/g, "\\_");
	return `%${escaped}%`;
}

/**
 * Default pagination values for consistent defaults across endpoints
 */
export const DEFAULT_PAGINATION = {
	page: 1,
	limit: 20,
	sortBy: "createdAt",
	sortOrder: "desc" as const,
} as const;
