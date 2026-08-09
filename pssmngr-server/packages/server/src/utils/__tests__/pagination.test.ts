// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Pagination Utilities - Comprehensive Unit Tests
 *
 * Tests for all pagination utility functions including:
 * - calculateOffset: SQL OFFSET calculation
 * - createPaginatedResponse: Standardized response creation
 * - buildSearchPattern: LIKE pattern escaping
 * - paginationInputSchema: Zod schema validation
 * - DEFAULT_PAGINATION: Default values constant
 *
 * @module utils/__tests__/pagination.test
 */

import { describe, expect, it } from "vitest";
import {
	buildSearchPattern,
	calculateOffset,
	createPaginatedResponse,
	DEFAULT_PAGINATION,
	paginationInputSchema,
} from "../pagination";

describe("Pagination Utilities", () => {
	// ========================================
	// calculateOffset
	// ========================================
	describe("calculateOffset", () => {
		it("returns 0 for page 1", () => {
			expect(calculateOffset(1, 20)).toBe(0);
		});

		it("returns correct offset for page 2", () => {
			expect(calculateOffset(2, 20)).toBe(20);
		});

		it("returns correct offset for page 3 with limit 20", () => {
			expect(calculateOffset(3, 20)).toBe(40);
		});

		it("handles custom limit", () => {
			expect(calculateOffset(2, 50)).toBe(50);
			expect(calculateOffset(3, 50)).toBe(100);
		});

		it("handles limit of 1", () => {
			expect(calculateOffset(5, 1)).toBe(4);
		});

		it("handles large page numbers", () => {
			expect(calculateOffset(100, 20)).toBe(1980);
		});
	});

	// ========================================
	// createPaginatedResponse
	// ========================================
	describe("createPaginatedResponse", () => {
		it("creates correct response structure", () => {
			const data = [{ id: 1 }, { id: 2 }];
			const result = createPaginatedResponse(data, 100, 1, 20);

			expect(result).toEqual({
				data: [{ id: 1 }, { id: 2 }],
				pagination: {
					page: 1,
					limit: 20,
					total: 100,
					totalPages: 5,
				},
			});
		});

		it("calculates totalPages correctly (rounds up)", () => {
			const result = createPaginatedResponse([], 45, 1, 20);
			expect(result.pagination.totalPages).toBe(3); // 45/20 = 2.25 -> 3
		});

		it("handles exact division", () => {
			const result = createPaginatedResponse([], 40, 1, 20);
			expect(result.pagination.totalPages).toBe(2);
		});

		it("handles zero total", () => {
			const result = createPaginatedResponse([], 0, 1, 20);
			expect(result.pagination.totalPages).toBe(0);
		});

		it("handles single item", () => {
			const result = createPaginatedResponse([{ id: 1 }], 1, 1, 20);
			expect(result.pagination.totalPages).toBe(1);
		});

		it("preserves data array reference", () => {
			const data = [{ id: 1 }];
			const result = createPaginatedResponse(data, 1, 1, 20);
			expect(result.data).toBe(data);
		});

		it("handles empty data array", () => {
			const result = createPaginatedResponse([], 0, 1, 20);
			expect(result.data).toEqual([]);
			expect(result.pagination.total).toBe(0);
		});
	});

	// ========================================
	// buildSearchPattern
	// ========================================
	describe("buildSearchPattern", () => {
		it("wraps search term in wildcards", () => {
			expect(buildSearchPattern("john")).toBe("%john%");
		});

		it("handles empty string", () => {
			expect(buildSearchPattern("")).toBe("%%");
		});

		it("escapes percent sign", () => {
			expect(buildSearchPattern("100%")).toBe("%100\\%%");
		});

		it("escapes underscore", () => {
			expect(buildSearchPattern("user_name")).toBe("%user\\_name%");
		});

		it("escapes backslash", () => {
			expect(buildSearchPattern("path\\to")).toBe("%path\\\\to%");
		});

		it("escapes multiple special characters", () => {
			expect(buildSearchPattern("100%_test\\path")).toBe(
				"%100\\%\\_test\\\\path%",
			);
		});

		it("handles spaces", () => {
			expect(buildSearchPattern("john doe")).toBe("%john doe%");
		});

		it("handles unicode characters", () => {
			expect(buildSearchPattern("测试")).toBe("%测试%");
			expect(buildSearchPattern("مرحبا")).toBe("%مرحبا%");
		});
	});

	// ========================================
	// paginationInputSchema
	// ========================================
	describe("paginationInputSchema", () => {
		describe("defaults", () => {
			it("applies all default values", () => {
				const result = paginationInputSchema.parse({});
				expect(result).toEqual({
					page: 1,
					limit: 20,
					sortBy: "createdAt",
					sortOrder: "desc",
				});
			});

			it("preserves provided values", () => {
				const result = paginationInputSchema.parse({
					page: 5,
					limit: 50,
					search: "test",
					sortBy: "name",
					sortOrder: "asc",
				});
				expect(result).toEqual({
					page: 5,
					limit: 50,
					search: "test",
					sortBy: "name",
					sortOrder: "asc",
				});
			});
		});

		describe("page validation", () => {
			it("accepts page 1", () => {
				const result = paginationInputSchema.parse({ page: 1 });
				expect(result.page).toBe(1);
			});

			it("rejects page 0", () => {
				expect(() => paginationInputSchema.parse({ page: 0 })).toThrow();
			});

			it("rejects negative page", () => {
				expect(() => paginationInputSchema.parse({ page: -1 })).toThrow();
			});

			it("rejects non-integer page", () => {
				expect(() => paginationInputSchema.parse({ page: 1.5 })).toThrow();
			});

			it("accepts large page numbers", () => {
				const result = paginationInputSchema.parse({ page: 1000 });
				expect(result.page).toBe(1000);
			});
		});

		describe("limit validation", () => {
			it("accepts limit 1", () => {
				const result = paginationInputSchema.parse({ limit: 1 });
				expect(result.limit).toBe(1);
			});

			it("accepts limit 100", () => {
				const result = paginationInputSchema.parse({ limit: 100 });
				expect(result.limit).toBe(100);
			});

			it("rejects limit 0", () => {
				expect(() => paginationInputSchema.parse({ limit: 0 })).toThrow();
			});

			it("rejects limit > 100", () => {
				expect(() => paginationInputSchema.parse({ limit: 101 })).toThrow();
			});

			it("rejects negative limit", () => {
				expect(() => paginationInputSchema.parse({ limit: -10 })).toThrow();
			});

			it("rejects non-integer limit", () => {
				expect(() => paginationInputSchema.parse({ limit: 10.5 })).toThrow();
			});
		});

		describe("search validation", () => {
			it("accepts string search", () => {
				const result = paginationInputSchema.parse({ search: "test" });
				expect(result.search).toBe("test");
			});

			it("accepts empty string", () => {
				const result = paginationInputSchema.parse({ search: "" });
				expect(result.search).toBe("");
			});

			it("accepts undefined search", () => {
				const result = paginationInputSchema.parse({});
				expect(result.search).toBeUndefined();
			});

			it("accepts long search strings", () => {
				const longSearch = "a".repeat(1000);
				const result = paginationInputSchema.parse({ search: longSearch });
				expect(result.search).toBe(longSearch);
			});
		});

		describe("sortBy validation", () => {
			it("accepts any string", () => {
				const result = paginationInputSchema.parse({
					sortBy: "customField",
				});
				expect(result.sortBy).toBe("customField");
			});

			it("uses default when not provided", () => {
				const result = paginationInputSchema.parse({});
				expect(result.sortBy).toBe("createdAt");
			});
		});

		describe("sortOrder validation", () => {
			it("accepts asc", () => {
				const result = paginationInputSchema.parse({ sortOrder: "asc" });
				expect(result.sortOrder).toBe("asc");
			});

			it("accepts desc", () => {
				const result = paginationInputSchema.parse({ sortOrder: "desc" });
				expect(result.sortOrder).toBe("desc");
			});

			it("rejects invalid sort order", () => {
				expect(() =>
					paginationInputSchema.parse({ sortOrder: "invalid" }),
				).toThrow();
			});

			it("uses default when not provided", () => {
				const result = paginationInputSchema.parse({});
				expect(result.sortOrder).toBe("desc");
			});
		});
	});

	// ========================================
	// DEFAULT_PAGINATION
	// ========================================
	describe("DEFAULT_PAGINATION", () => {
		it("has correct default values", () => {
			expect(DEFAULT_PAGINATION).toEqual({
				page: 1,
				limit: 20,
				sortBy: "createdAt",
				sortOrder: "desc",
			});
		});

		it("has readonly type (TypeScript enforced)", () => {
			// DEFAULT_PAGINATION uses `as const` for TypeScript-level immutability.
			// Verify the values are correct and match schema defaults.
			const schemaDefaults = paginationInputSchema.parse({});
			expect(DEFAULT_PAGINATION.page).toBe(schemaDefaults.page);
			expect(DEFAULT_PAGINATION.limit).toBe(schemaDefaults.limit);
			expect(DEFAULT_PAGINATION.sortBy).toBe(schemaDefaults.sortBy);
			expect(DEFAULT_PAGINATION.sortOrder).toBe(schemaDefaults.sortOrder);
		});
	});
});
