// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Pagination Component
 *
 * Reusable pagination controls for lists and tables.
 * Supports page navigation, page size selection, and RTL layouts.
 *
 * @module components/ui/pagination
 */

import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { PaginationMeta } from "@/types/pagination";
import { PAGE_SIZE_OPTIONS } from "@/types/pagination";

// ============================================================================
// Types
// ============================================================================

export interface PaginationProps {
	/** Pagination metadata from API response */
	pagination: PaginationMeta;
	/** Callback when page changes */
	onPageChange: (page: number) => void;
	/** Callback when page size changes (optional) */
	onPageSizeChange?: (pageSize: number) => void;
	/** Show page size selector */
	showPageSize?: boolean;
	/** Available page size options */
	pageSizeOptions?: readonly number[];
	/** Additional CSS classes */
	className?: string;
	/** Disable all controls */
	disabled?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate array of page numbers with ellipsis
 * Shows first, last, and pages around current
 */
function getPageNumbers(current: number, total: number): (number | "...")[] {
	if (total <= 7) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}

	const pages: (number | "...")[] = [];

	// Always show first page
	pages.push(1);

	if (current > 3) {
		pages.push("...");
	}

	// Show pages around current
	const start = Math.max(2, current - 1);
	const end = Math.min(total - 1, current + 1);

	for (let i = start; i <= end; i++) {
		pages.push(i);
	}

	if (current < total - 2) {
		pages.push("...");
	}

	// Always show last page
	if (total > 1) {
		pages.push(total);
	}

	return pages;
}

// ============================================================================
// Component
// ============================================================================

export function Pagination({
	pagination,
	onPageChange,
	onPageSizeChange,
	showPageSize = true,
	pageSizeOptions = PAGE_SIZE_OPTIONS,
	className,
	disabled = false,
}: PaginationProps) {
	const { t } = useTranslation("common");

	const { page, limit, total, totalPages } = pagination;
	const canGoPrevious = page > 1;
	const canGoNext = page < totalPages;

	return (
		<div
			className={cn(
				"flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
				className,
			)}
		>
			{/* Page info and page size selector */}
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
				{/* Total count */}
				<p className="text-sm text-muted-foreground">
					{t("pagination.showing", "Page {{page}} of {{totalPages}}", {
						page,
						totalPages: totalPages || 1,
					})}
					{" · "}
					{t("pagination.total", "{{total}} items", { total })}
				</p>

				{/* Page size selector */}
				{showPageSize && onPageSizeChange && (
					<Select
						value={String(limit)}
						onValueChange={(value) => onPageSizeChange(Number(value))}
						disabled={disabled}
					>
						<SelectTrigger className="w-[120px] h-10">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{pageSizeOptions.map((size) => (
								<SelectItem key={size} value={String(size)}>
									{size} / {t("pagination.page", "page")}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>

			{/* Navigation controls */}
			<div className="flex items-center gap-1">
				{/* First page */}
				<Button
					variant="outline"
					size="icon"
					className="h-10 w-10"
					onClick={() => onPageChange(1)}
					disabled={!canGoPrevious || disabled}
					aria-label={t("pagination.first", "First page")}
				>
					<ChevronsLeft className="h-4 w-4 rtl:scale-x-[-1]" />
				</Button>

				{/* Previous page */}
				<Button
					variant="outline"
					size="icon"
					className="h-10 w-10"
					onClick={() => onPageChange(page - 1)}
					disabled={!canGoPrevious || disabled}
					aria-label={t("pagination.previous", "Previous page")}
				>
					<ChevronLeft className="h-4 w-4 rtl:scale-x-[-1]" />
				</Button>

				{/* Page numbers */}
				<div className="flex items-center gap-1 mx-1 sm:mx-2">
					{getPageNumbers(page, totalPages).map((pageNum, index) =>
						pageNum === "..." ? (
							<span
								key={`ellipsis-${index}`}
								className="px-2 text-muted-foreground select-none"
								aria-hidden="true"
							>
								...
							</span>
						) : (
							<Button
								key={pageNum}
								variant={pageNum === page ? "default" : "outline"}
								size="icon"
								className="h-10 w-10 hidden sm:inline-flex"
								onClick={() => onPageChange(pageNum as number)}
								disabled={disabled}
								aria-label={t("pagination.goToPage", "Go to page {{page}}", {
									page: pageNum,
								})}
								aria-current={pageNum === page ? "page" : undefined}
							>
								{pageNum}
							</Button>
						),
					)}

					{/* Mobile: show only current page indicator */}
					<span className="px-3 py-2 text-sm font-medium sm:hidden">
						{page} / {totalPages || 1}
					</span>
				</div>

				{/* Next page */}
				<Button
					variant="outline"
					size="icon"
					className="h-10 w-10"
					onClick={() => onPageChange(page + 1)}
					disabled={!canGoNext || disabled}
					aria-label={t("pagination.next", "Next page")}
				>
					<ChevronRight className="h-4 w-4 rtl:scale-x-[-1]" />
				</Button>

				{/* Last page */}
				<Button
					variant="outline"
					size="icon"
					className="h-10 w-10"
					onClick={() => onPageChange(totalPages)}
					disabled={!canGoNext || disabled}
					aria-label={t("pagination.last", "Last page")}
				>
					<ChevronsRight className="h-4 w-4 rtl:scale-x-[-1]" />
				</Button>
			</div>
		</div>
	);
}

// ============================================================================
// Compact Variant
// ============================================================================

export interface CompactPaginationProps {
	pagination: PaginationMeta;
	onPageChange: (page: number) => void;
	className?: string;
	disabled?: boolean;
}

/**
 * Compact pagination for tight spaces
 * Shows only prev/next buttons and page indicator
 */
export function CompactPagination({
	pagination,
	onPageChange,
	className,
	disabled = false,
}: CompactPaginationProps) {
	const { t } = useTranslation("common");

	const { page, totalPages } = pagination;
	const canGoPrevious = page > 1;
	const canGoNext = page < totalPages;

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<Button
				variant="outline"
				size="icon"
				className="h-8 w-8"
				onClick={() => onPageChange(page - 1)}
				disabled={!canGoPrevious || disabled}
				aria-label={t("pagination.previous", "Previous page")}
			>
				<ChevronLeft className="h-4 w-4 rtl:scale-x-[-1]" />
			</Button>

			<span className="text-sm text-muted-foreground min-w-[60px] text-center">
				{page} / {totalPages || 1}
			</span>

			<Button
				variant="outline"
				size="icon"
				className="h-8 w-8"
				onClick={() => onPageChange(page + 1)}
				disabled={!canGoNext || disabled}
				aria-label={t("pagination.next", "Next page")}
			>
				<ChevronRight className="h-4 w-4 rtl:scale-x-[-1]" />
			</Button>
		</div>
	);
}

export default Pagination;
