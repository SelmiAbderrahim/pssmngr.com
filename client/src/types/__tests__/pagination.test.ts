// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it } from "vitest";
import {
	parsePaginationSearch,
	isPaginatedResponse,
	hasNextPage,
	hasPreviousPage,
	DEFAULT_PAGINATION,
} from "../pagination";

describe("Pagination Types", () => {
	describe("parsePaginationSearch", () => {
		it("returns defaults for empty object", () => {
			const result = parsePaginationSearch({});

			expect(result).toEqual(DEFAULT_PAGINATION);
		});

		it("parses valid values", () => {
			const result = parsePaginationSearch({
				page: 3,
				limit: 50,
				search: "test",
				sortBy: "name",
				sortOrder: "asc",
			});

			expect(result).toEqual({
				page: 3,
				limit: 50,
				search: "test",
				sortBy: "name",
				sortOrder: "asc",
			});
		});

		it("rejects invalid page values", () => {
			expect(parsePaginationSearch({ page: 0 }).page).toBe(1);
			expect(parsePaginationSearch({ page: -1 }).page).toBe(1);
			expect(parsePaginationSearch({ page: "invalid" }).page).toBe(1);
			expect(parsePaginationSearch({ page: null }).page).toBe(1);
		});

		it("rejects invalid limit values", () => {
			expect(parsePaginationSearch({ limit: 0 }).limit).toBe(20);
			expect(parsePaginationSearch({ limit: 101 }).limit).toBe(20);
			expect(parsePaginationSearch({ limit: -10 }).limit).toBe(20);
			expect(parsePaginationSearch({ limit: "invalid" }).limit).toBe(20);
		});

		it("handles search correctly", () => {
			expect(parsePaginationSearch({ search: "test" }).search).toBe(
				"test",
			);
			expect(parsePaginationSearch({ search: "" }).search).toBe("");
			expect(
				parsePaginationSearch({ search: 123 }).search,
			).toBeUndefined();
			expect(parsePaginationSearch({}).search).toBeUndefined();
		});

		it("rejects invalid sortOrder values", () => {
			expect(
				parsePaginationSearch({ sortOrder: "invalid" }).sortOrder,
			).toBe("desc");
			expect(
				parsePaginationSearch({ sortOrder: "ASC" }).sortOrder,
			).toBe("desc");
			expect(parsePaginationSearch({ sortOrder: 123 }).sortOrder).toBe(
				"desc",
			);
		});

		it("accepts valid sortOrder values", () => {
			expect(
				parsePaginationSearch({ sortOrder: "asc" }).sortOrder,
			).toBe("asc");
			expect(
				parsePaginationSearch({ sortOrder: "desc" }).sortOrder,
			).toBe("desc");
		});

		it("accepts valid sortBy string values", () => {
			expect(parsePaginationSearch({ sortBy: "name" }).sortBy).toBe(
				"name",
			);
			expect(
				parsePaginationSearch({ sortBy: "createdAt" }).sortBy,
			).toBe("createdAt");
		});

		it("uses default sortBy for non-string values", () => {
			expect(parsePaginationSearch({ sortBy: 123 }).sortBy).toBe(
				"createdAt",
			);
			expect(parsePaginationSearch({ sortBy: null }).sortBy).toBe(
				"createdAt",
			);
		});
	});

	describe("isPaginatedResponse", () => {
		it("returns true for valid paginated response", () => {
			const response = {
				data: [{ id: 1 }],
				pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
			};

			expect(isPaginatedResponse(response)).toBe(true);
		});

		it("returns false for null", () => {
			expect(isPaginatedResponse(null)).toBe(false);
		});

		it("returns false for undefined", () => {
			expect(isPaginatedResponse(undefined)).toBe(false);
		});

		it("returns false for string", () => {
			expect(isPaginatedResponse("string")).toBe(false);
		});

		it("returns false for missing data", () => {
			expect(isPaginatedResponse({ pagination: {} })).toBe(false);
		});

		it("returns false for non-array data", () => {
			expect(
				isPaginatedResponse({ data: {}, pagination: {} }),
			).toBe(false);
		});

		it("returns false for missing pagination", () => {
			expect(isPaginatedResponse({ data: [] })).toBe(false);
		});

		it("returns true for empty data array", () => {
			const response = {
				data: [],
				pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
			};

			expect(isPaginatedResponse(response)).toBe(true);
		});

		it("returns false for number", () => {
			expect(isPaginatedResponse(42)).toBe(false);
		});

		it("returns false for boolean", () => {
			expect(isPaginatedResponse(true)).toBe(false);
		});
	});

	describe("hasNextPage", () => {
		it("returns true when not on last page", () => {
			expect(
				hasNextPage({
					page: 1,
					limit: 20,
					total: 100,
					totalPages: 5,
				}),
			).toBe(true);
			expect(
				hasNextPage({
					page: 4,
					limit: 20,
					total: 100,
					totalPages: 5,
				}),
			).toBe(true);
		});

		it("returns false when on last page", () => {
			expect(
				hasNextPage({
					page: 5,
					limit: 20,
					total: 100,
					totalPages: 5,
				}),
			).toBe(false);
		});

		it("returns false when single page", () => {
			expect(
				hasNextPage({
					page: 1,
					limit: 20,
					total: 10,
					totalPages: 1,
				}),
			).toBe(false);
		});

		it("returns false when no pages", () => {
			expect(
				hasNextPage({
					page: 1,
					limit: 20,
					total: 0,
					totalPages: 0,
				}),
			).toBe(false);
		});
	});

	describe("hasPreviousPage", () => {
		it("returns true when not on first page", () => {
			expect(
				hasPreviousPage({
					page: 2,
					limit: 20,
					total: 100,
					totalPages: 5,
				}),
			).toBe(true);
			expect(
				hasPreviousPage({
					page: 5,
					limit: 20,
					total: 100,
					totalPages: 5,
				}),
			).toBe(true);
		});

		it("returns false when on first page", () => {
			expect(
				hasPreviousPage({
					page: 1,
					limit: 20,
					total: 100,
					totalPages: 5,
				}),
			).toBe(false);
		});
	});
});
