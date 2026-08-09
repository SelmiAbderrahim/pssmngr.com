import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination, CompactPagination } from "@/components/ui/pagination";

// Override the global react-i18next mock to handle the t(key, defaultValue, params) overload
// used by the Pagination component
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (
			key: string,
			defaultValueOrParams?: string | Record<string, unknown>,
			params?: Record<string, unknown>,
		) => {
			// Handle i18next overload: t(key, defaultValue, params) or t(key, params)
			let text: string;
			let interpolationParams: Record<string, unknown> | undefined;

			if (typeof defaultValueOrParams === "string") {
				text = defaultValueOrParams;
				interpolationParams = params;
			} else {
				text = key;
				interpolationParams = defaultValueOrParams;
			}

			if (interpolationParams) {
				Object.entries(interpolationParams).forEach(([k, v]) => {
					text = text.replace(`{{${k}}}`, String(v));
				});
			}
			return text;
		},
		i18n: {
			changeLanguage: vi.fn(),
			language: "en",
		},
	}),
	Trans: ({ children }: { children: React.ReactNode }) => children,
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
}));

describe("Pagination Component", () => {
	const defaultPagination = {
		page: 1,
		limit: 20,
		total: 100,
		totalPages: 5,
	};

	describe("rendering", () => {
		it("renders page info correctly", () => {
			render(
				<Pagination
					pagination={defaultPagination}
					onPageChange={vi.fn()}
				/>,
			);

			expect(screen.getByText(/Page 1 of 5/)).toBeInTheDocument();
			expect(screen.getByText(/100 items/)).toBeInTheDocument();
		});

		it("renders navigation buttons", () => {
			render(
				<Pagination
					pagination={defaultPagination}
					onPageChange={vi.fn()}
				/>,
			);

			expect(screen.getByLabelText("First page")).toBeInTheDocument();
			expect(screen.getByLabelText("Previous page")).toBeInTheDocument();
			expect(screen.getByLabelText("Next page")).toBeInTheDocument();
			expect(screen.getByLabelText("Last page")).toBeInTheDocument();
		});

		it("renders page size selector when showPageSize is true and onPageSizeChange provided", () => {
			const onPageSizeChange = vi.fn();
			render(
				<Pagination
					pagination={defaultPagination}
					onPageChange={vi.fn()}
					onPageSizeChange={onPageSizeChange}
					showPageSize
				/>,
			);

			expect(screen.getByRole("combobox")).toBeInTheDocument();
		});

		it("hides page size selector when showPageSize is false", () => {
			render(
				<Pagination
					pagination={defaultPagination}
					onPageChange={vi.fn()}
					showPageSize={false}
				/>,
			);

			expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
		});

		it("hides page size selector when onPageSizeChange is not provided", () => {
			render(
				<Pagination
					pagination={defaultPagination}
					onPageChange={vi.fn()}
					showPageSize={true}
				/>,
			);

			expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
		});
	});

	describe("button states", () => {
		it("disables First and Previous on first page", () => {
			render(
				<Pagination
					pagination={{ ...defaultPagination, page: 1 }}
					onPageChange={vi.fn()}
				/>,
			);

			expect(screen.getByLabelText("First page")).toBeDisabled();
			expect(screen.getByLabelText("Previous page")).toBeDisabled();
			expect(screen.getByLabelText("Next page")).not.toBeDisabled();
			expect(screen.getByLabelText("Last page")).not.toBeDisabled();
		});

		it("disables Next and Last on last page", () => {
			render(
				<Pagination
					pagination={{ ...defaultPagination, page: 5 }}
					onPageChange={vi.fn()}
				/>,
			);

			expect(screen.getByLabelText("First page")).not.toBeDisabled();
			expect(
				screen.getByLabelText("Previous page"),
			).not.toBeDisabled();
			expect(screen.getByLabelText("Next page")).toBeDisabled();
			expect(screen.getByLabelText("Last page")).toBeDisabled();
		});

		it("disables all buttons when disabled prop is true", () => {
			render(
				<Pagination
					pagination={{ ...defaultPagination, page: 3 }}
					onPageChange={vi.fn()}
					disabled
				/>,
			);

			expect(screen.getByLabelText("First page")).toBeDisabled();
			expect(screen.getByLabelText("Previous page")).toBeDisabled();
			expect(screen.getByLabelText("Next page")).toBeDisabled();
			expect(screen.getByLabelText("Last page")).toBeDisabled();
		});
	});

	describe("navigation callbacks", () => {
		it("calls onPageChange with 1 for First", () => {
			const onPageChange = vi.fn();
			render(
				<Pagination
					pagination={{ ...defaultPagination, page: 3 }}
					onPageChange={onPageChange}
				/>,
			);

			fireEvent.click(screen.getByLabelText("First page"));
			expect(onPageChange).toHaveBeenCalledWith(1);
		});

		it("calls onPageChange with previous page for Previous", () => {
			const onPageChange = vi.fn();
			render(
				<Pagination
					pagination={{ ...defaultPagination, page: 3 }}
					onPageChange={onPageChange}
				/>,
			);

			fireEvent.click(screen.getByLabelText("Previous page"));
			expect(onPageChange).toHaveBeenCalledWith(2);
		});

		it("calls onPageChange with next page for Next", () => {
			const onPageChange = vi.fn();
			render(
				<Pagination
					pagination={{ ...defaultPagination, page: 3 }}
					onPageChange={onPageChange}
				/>,
			);

			fireEvent.click(screen.getByLabelText("Next page"));
			expect(onPageChange).toHaveBeenCalledWith(4);
		});

		it("calls onPageChange with totalPages for Last", () => {
			const onPageChange = vi.fn();
			render(
				<Pagination
					pagination={{ ...defaultPagination, page: 3 }}
					onPageChange={onPageChange}
				/>,
			);

			fireEvent.click(screen.getByLabelText("Last page"));
			expect(onPageChange).toHaveBeenCalledWith(5);
		});
	});

	describe("page numbers", () => {
		it("shows all page numbers when totalPages <= 7", () => {
			render(
				<Pagination
					pagination={{ ...defaultPagination, totalPages: 5 }}
					onPageChange={vi.fn()}
				/>,
			);

			// Page number buttons are hidden on mobile (sm:inline-flex) but exist in DOM
			for (let i = 1; i <= 5; i++) {
				expect(
					screen.getByLabelText(`Go to page ${i}`),
				).toBeInTheDocument();
			}
		});

		it("shows ellipsis for large page counts", () => {
			render(
				<Pagination
					pagination={{
						...defaultPagination,
						page: 5,
						totalPages: 10,
					}}
					onPageChange={vi.fn()}
				/>,
			);

			// Should show ellipsis
			const ellipsis = screen.getAllByText("...");
			expect(ellipsis.length).toBeGreaterThan(0);
		});

		it("highlights current page with aria-current", () => {
			render(
				<Pagination
					pagination={{ ...defaultPagination, page: 3 }}
					onPageChange={vi.fn()}
				/>,
			);

			const currentPageButton = screen.getByLabelText("Go to page 3");
			expect(currentPageButton).toHaveAttribute(
				"aria-current",
				"page",
			);
		});

		it("does not set aria-current on non-current pages", () => {
			render(
				<Pagination
					pagination={{ ...defaultPagination, page: 3 }}
					onPageChange={vi.fn()}
				/>,
			);

			const otherPageButton = screen.getByLabelText("Go to page 1");
			expect(otherPageButton).not.toHaveAttribute("aria-current");
		});

		it("calls onPageChange when clicking a page number", () => {
			const onPageChange = vi.fn();
			render(
				<Pagination
					pagination={{ ...defaultPagination, page: 1 }}
					onPageChange={onPageChange}
				/>,
			);

			fireEvent.click(screen.getByLabelText("Go to page 3"));
			expect(onPageChange).toHaveBeenCalledWith(3);
		});
	});

	describe("single page", () => {
		it("disables all navigation buttons on single page", () => {
			render(
				<Pagination
					pagination={{
						page: 1,
						limit: 20,
						total: 10,
						totalPages: 1,
					}}
					onPageChange={vi.fn()}
				/>,
			);

			expect(screen.getByLabelText("First page")).toBeDisabled();
			expect(screen.getByLabelText("Previous page")).toBeDisabled();
			expect(screen.getByLabelText("Next page")).toBeDisabled();
			expect(screen.getByLabelText("Last page")).toBeDisabled();
		});
	});

	describe("zero items", () => {
		it("handles zero total correctly", () => {
			render(
				<Pagination
					pagination={{
						page: 1,
						limit: 20,
						total: 0,
						totalPages: 0,
					}}
					onPageChange={vi.fn()}
				/>,
			);

			expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
			expect(screen.getByText(/0 items/)).toBeInTheDocument();
		});

		it("disables all navigation with zero items", () => {
			render(
				<Pagination
					pagination={{
						page: 1,
						limit: 20,
						total: 0,
						totalPages: 0,
					}}
					onPageChange={vi.fn()}
				/>,
			);

			expect(screen.getByLabelText("First page")).toBeDisabled();
			expect(screen.getByLabelText("Previous page")).toBeDisabled();
			expect(screen.getByLabelText("Next page")).toBeDisabled();
			expect(screen.getByLabelText("Last page")).toBeDisabled();
		});
	});

	describe("custom className", () => {
		it("applies additional className", () => {
			const { container } = render(
				<Pagination
					pagination={defaultPagination}
					onPageChange={vi.fn()}
					className="custom-class"
				/>,
			);

			expect(container.firstChild).toHaveClass("custom-class");
		});
	});
});

describe("CompactPagination Component", () => {
	it("renders compact layout with page indicator", () => {
		render(
			<CompactPagination
				pagination={{
					page: 2,
					limit: 20,
					total: 50,
					totalPages: 3,
				}}
				onPageChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("2 / 3")).toBeInTheDocument();
		expect(screen.getByLabelText("Previous page")).toBeInTheDocument();
		expect(screen.getByLabelText("Next page")).toBeInTheDocument();
	});

	it("navigates to previous page correctly", () => {
		const onPageChange = vi.fn();
		render(
			<CompactPagination
				pagination={{
					page: 2,
					limit: 20,
					total: 50,
					totalPages: 3,
				}}
				onPageChange={onPageChange}
			/>,
		);

		fireEvent.click(screen.getByLabelText("Previous page"));
		expect(onPageChange).toHaveBeenCalledWith(1);
	});

	it("navigates to next page correctly", () => {
		const onPageChange = vi.fn();
		render(
			<CompactPagination
				pagination={{
					page: 2,
					limit: 20,
					total: 50,
					totalPages: 3,
				}}
				onPageChange={onPageChange}
			/>,
		);

		fireEvent.click(screen.getByLabelText("Next page"));
		expect(onPageChange).toHaveBeenCalledWith(3);
	});

	it("disables Previous on first page", () => {
		render(
			<CompactPagination
				pagination={{
					page: 1,
					limit: 20,
					total: 50,
					totalPages: 3,
				}}
				onPageChange={vi.fn()}
			/>,
		);

		expect(screen.getByLabelText("Previous page")).toBeDisabled();
		expect(screen.getByLabelText("Next page")).not.toBeDisabled();
	});

	it("disables Next on last page", () => {
		render(
			<CompactPagination
				pagination={{
					page: 3,
					limit: 20,
					total: 50,
					totalPages: 3,
				}}
				onPageChange={vi.fn()}
			/>,
		);

		expect(
			screen.getByLabelText("Previous page"),
		).not.toBeDisabled();
		expect(screen.getByLabelText("Next page")).toBeDisabled();
	});

	it("disables all buttons when disabled prop is true", () => {
		render(
			<CompactPagination
				pagination={{
					page: 2,
					limit: 20,
					total: 50,
					totalPages: 3,
				}}
				onPageChange={vi.fn()}
				disabled
			/>,
		);

		expect(screen.getByLabelText("Previous page")).toBeDisabled();
		expect(screen.getByLabelText("Next page")).toBeDisabled();
	});

	it("shows 1 / 1 for zero totalPages", () => {
		render(
			<CompactPagination
				pagination={{
					page: 1,
					limit: 20,
					total: 0,
					totalPages: 0,
				}}
				onPageChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("1 / 1")).toBeInTheDocument();
	});

	it("applies custom className", () => {
		const { container } = render(
			<CompactPagination
				pagination={{
					page: 1,
					limit: 20,
					total: 50,
					totalPages: 3,
				}}
				onPageChange={vi.fn()}
				className="compact-custom"
			/>,
		);

		expect(container.firstChild).toHaveClass("compact-custom");
	});
});
