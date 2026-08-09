// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * usePagination Hook
 *
 * Manages pagination state with optional URL persistence.
 * Use with TanStack Router's useSearch and useNavigate.
 *
 * @module hooks/usePagination
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { PartialPaginationParams } from "@/types/pagination";
import type { PaginationParams } from "@/types/pagination";
import { DEFAULT_PAGINATION, parsePaginationSearch } from "@/types/pagination";
import { useDebounce } from "./useDebounce";

// ============================================================================
// Types
// ============================================================================

export interface UsePaginationOptions {
	/** Initial pagination values (overrides URL and defaults) */
	initial?: PartialPaginationParams;
	/** Persist pagination state to URL query params */
	persistToUrl?: boolean;
	/** Debounce delay for search in ms */
	searchDebounceMs?: number;
	/** Default page size */
	defaultLimit?: number;
	/** Default sort column */
	defaultSortBy?: string;
	/** Default sort direction */
	defaultSortOrder?: "asc" | "desc";
}

export interface UsePaginationReturn {
	/** Current pagination state */
	params: PaginationParams;
	/** Debounced search value (for API calls) */
	debouncedSearch: string | undefined;
	/** Set current page */
	setPage: (page: number) => void;
	/** Set items per page (resets to page 1) */
	setLimit: (limit: number) => void;
	/** Set search query (resets to page 1) */
	setSearch: (search: string) => void;
	/** Set sort column and direction (resets to page 1) */
	setSort: (sortBy: string, sortOrder?: "asc" | "desc") => void;
	/** Toggle sort direction */
	toggleSort: (sortBy: string) => void;
	/** Update multiple params at once */
	updateParams: (updates: PartialPaginationParams) => void;
	/** Reset to initial/default values */
	reset: () => void;
	/** Check if any filters are active */
	hasActiveFilters: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePagination(
	options: UsePaginationOptions = {},
): UsePaginationReturn {
	const {
		initial,
		persistToUrl = true,
		searchDebounceMs = 300,
		defaultLimit = DEFAULT_PAGINATION.limit,
		defaultSortBy = DEFAULT_PAGINATION.sortBy,
		defaultSortOrder = DEFAULT_PAGINATION.sortOrder,
	} = options;

	const navigate = useNavigate();

	// Try to read from URL if persistToUrl is enabled
	let urlParams: PaginationParams | null = null;
	try {
		if (persistToUrl) {
			const search = useSearch({ strict: false }) as Record<string, unknown>;
			urlParams = parsePaginationSearch(search);
		}
	} catch {
		// Not in a route context, use state only
	}

	// Build initial state from: URL > initial > defaults
	const initialState: PaginationParams = useMemo(
		() => ({
			page: initial?.page ?? urlParams?.page ?? 1,
			limit: initial?.limit ?? urlParams?.limit ?? defaultLimit,
			search: initial?.search ?? urlParams?.search ?? undefined,
			sortBy: initial?.sortBy ?? urlParams?.sortBy ?? defaultSortBy,
			sortOrder:
				initial?.sortOrder ?? urlParams?.sortOrder ?? defaultSortOrder,
		}),
		[], // Only compute once
	);

	const [params, setParams] = useState<PaginationParams>(initialState);

	// Debounce search for API calls
	const debouncedSearch = useDebounce(params.search, searchDebounceMs);

	// Sync to URL when params change
	useEffect(() => {
		if (!persistToUrl) return;

		try {
			navigate({
				 
				search: ((prev: Record<string, unknown>) => ({
					...prev,
					page: params.page,
					limit: params.limit,
					search: params.search || undefined,
					sortBy: params.sortBy,
					sortOrder: params.sortOrder,
				})) as any,
				replace: true, // Don't create history entry for each change
			});
		} catch {
			// Not in a route context, skip URL sync
		}
	}, [params, persistToUrl, navigate]);

	// ============================================================================
	// Actions
	// ============================================================================

	const setPage = useCallback((page: number) => {
		setParams((prev) => ({ ...prev, page: Math.max(1, page) }));
	}, []);

	const setLimit = useCallback((limit: number) => {
		setParams((prev) => ({
			...prev,
			limit: Math.min(100, Math.max(1, limit)),
			page: 1, // Reset to first page
		}));
	}, []);

	const setSearch = useCallback((search: string) => {
		setParams((prev) => ({
			...prev,
			search: search || undefined,
			page: 1, // Reset to first page
		}));
	}, []);

	const setSort = useCallback(
		(sortBy: string, sortOrder?: "asc" | "desc") => {
			setParams((prev) => ({
				...prev,
				sortBy,
				sortOrder: sortOrder ?? prev.sortOrder,
				page: 1, // Reset to first page
			}));
		},
		[],
	);

	const toggleSort = useCallback((sortBy: string) => {
		setParams((prev) => ({
			...prev,
			sortBy,
			sortOrder:
				prev.sortBy === sortBy && prev.sortOrder === "asc" ? "desc" : "asc",
			page: 1, // Reset to first page
		}));
	}, []);

	const updateParams = useCallback((updates: PartialPaginationParams) => {
		setParams((prev) => {
			const next = { ...prev, ...updates };
			// Reset to page 1 if search, sort, or limit changed
			if (
				updates.search !== undefined ||
				updates.sortBy !== undefined ||
				updates.sortOrder !== undefined ||
				updates.limit !== undefined
			) {
				next.page = updates.page ?? 1;
			}
			return next;
		});
	}, []);

	const reset = useCallback(() => {
		setParams({
			page: 1,
			limit: defaultLimit,
			search: undefined,
			sortBy: defaultSortBy,
			sortOrder: defaultSortOrder,
		});
	}, [defaultLimit, defaultSortBy, defaultSortOrder]);

	// Check if any filters are active (not at defaults)
	const hasActiveFilters = useMemo(() => {
		return (
			params.page !== 1 ||
			params.search !== undefined ||
			params.sortBy !== defaultSortBy ||
			params.sortOrder !== defaultSortOrder
		);
	}, [params, defaultSortBy, defaultSortOrder]);

	return {
		params,
		debouncedSearch,
		setPage,
		setLimit,
		setSearch,
		setSort,
		toggleSort,
		updateParams,
		reset,
		hasActiveFilters,
	};
}

export default usePagination;
