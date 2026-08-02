// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Pagination Types
 *
 * Shared TypeScript types for pagination across the client application.
 * These types mirror the backend response format.
 *
 * @module types/pagination
 */

// ============================================================================
// Request Types
// ============================================================================

/**
 * Standard pagination parameters for API requests
 * Used by services and hooks when making paginated queries
 */
export interface PaginationParams {
	/** Current page number (1-indexed) */
	page: number;
	/** Number of items per page (max 100) */
	limit: number;
	/** Search query string (optional) */
	search?: string;
	/** Column to sort by (default: createdAt) */
	sortBy?: string;
	/** Sort direction */
	sortOrder?: "asc" | "desc";
}

/**
 * Partial pagination params for optional overrides
 * Used when you only want to change specific pagination values
 */
export type PartialPaginationParams = Partial<PaginationParams>;

// ============================================================================
// Response Types
// ============================================================================

/**
 * Pagination metadata returned by API
 * Included in all paginated responses
 */
export interface PaginationMeta {
	/** Current page number */
	page: number;
	/** Items per page */
	limit: number;
	/** Total number of items across all pages */
	total: number;
	/** Total number of pages */
	totalPages: number;
}

/**
 * Generic paginated response wrapper
 * Use to type API responses that include pagination
 *
 * @example
 * type DeploymentsResponse = PaginatedResponse<Deployment>;
 *
 * const { data: response } = useDeployments(params);
 * // response.data is Deployment[]
 * // response.pagination is PaginationMeta
 */
export interface PaginatedApiResponse<T> {
	/** Array of items for the current page */
	data: T[];
	/** Pagination metadata */
	pagination: PaginationMeta;
}

/**
 * Alias for PaginatedApiResponse
 * Convenience type matching common naming conventions
 */
export type PaginatedResponse<T> = PaginatedApiResponse<T>;

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default pagination values
 * Use when initializing pagination state
 */
export const DEFAULT_PAGINATION: PaginationParams = {
	page: 1,
	limit: 20,
	sortBy: "createdAt",
	sortOrder: "desc",
};

/**
 * Available page size options for pagination dropdowns
 */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/**
 * Type for page size option values
 */
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

// ============================================================================
// URL State Types
// ============================================================================

/**
 * Search params for URL-based pagination state
 * Used with TanStack Router's validateSearch
 */
export interface PaginationSearchParams {
	page?: number;
	limit?: number;
	search?: string;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}

/**
 * Validate and parse pagination search params from URL
 * @param search - Raw search params from URL
 * @returns Validated pagination params with defaults
 */
export function parsePaginationSearch(
	search: Record<string, unknown>,
): PaginationParams {
	return {
		page:
			typeof search.page === "number" && search.page >= 1
				? search.page
				: DEFAULT_PAGINATION.page,
		limit:
			typeof search.limit === "number" &&
			search.limit >= 1 &&
			search.limit <= 100
				? search.limit
				: DEFAULT_PAGINATION.limit,
		search: typeof search.search === "string" ? search.search : undefined,
		sortBy:
			typeof search.sortBy === "string"
				? search.sortBy
				: DEFAULT_PAGINATION.sortBy,
		sortOrder:
			search.sortOrder === "asc" || search.sortOrder === "desc"
				? search.sortOrder
				: DEFAULT_PAGINATION.sortOrder,
	};
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a response is paginated
 */
export function isPaginatedResponse<T>(
	response: unknown,
): response is PaginatedApiResponse<T> {
	return (
		typeof response === "object" &&
		response !== null &&
		"data" in response &&
		"pagination" in response &&
		Array.isArray((response as PaginatedApiResponse<T>).data) &&
		typeof (response as PaginatedApiResponse<T>).pagination === "object"
	);
}

/**
 * Check if pagination has more pages
 */
export function hasNextPage(pagination: PaginationMeta): boolean {
	return pagination.page < pagination.totalPages;
}

/**
 * Check if pagination has previous pages
 */
export function hasPreviousPage(pagination: PaginationMeta): boolean {
	return pagination.page > 1;
}
