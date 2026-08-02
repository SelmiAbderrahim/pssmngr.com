// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateWorkspaceDialog } from "../CreateWorkspaceDialog";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// CreateWorkspaceDialog uses useCreateOrganization (which internally calls
// useQueryClient) and useWorkspaceContext. Both are mocked so the component can
// render without a QueryClientProvider or WorkspaceProvider wrapper.

const mockMutateAsync = vi.fn().mockResolvedValue({ id: "org-new" });
const mockSwitchWorkspace = vi.fn().mockResolvedValue(undefined);
vi.mock("@/hooks/deployment/useWorkspace", () => ({
	useCreateOrganization: () => ({
		mutateAsync: mockMutateAsync,
		isPending: false,
	}),
}));

vi.mock("@/providers/WorkspaceContext", () => ({
	useWorkspaceContext: () => ({
		switchWorkspace: mockSwitchWorkspace,
		workspaces: Array.from({ length: 5 }, (_, index) => ({
			id: `workspace-${index}`,
			role: "owner",
		})),
	}),
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

/**
 * CreateWorkspaceDialog renders a Radix dialog. When closed it renders nothing
 * (Radix unmounts the portal content), and when open it portals the dialog
 * content (title, name/slug inputs, submit button) into the document body.
 */
describe("CreateWorkspaceDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Rendering", () => {
		it("renders nothing when open is false", () => {
			const { container } = render(
				<CreateWorkspaceDialog open={false} onOpenChange={vi.fn()} />,
			);
			// Radix Dialog renders no content when closed.
			expect(container).toBeEmptyDOMElement();
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		});

		it("renders the dialog content when open is true", () => {
			render(<CreateWorkspaceDialog open={true} onOpenChange={vi.fn()} />);
			// Dialog content is portaled to the document body.
			expect(screen.getByRole("dialog")).toBeInTheDocument();
			// Name and slug inputs are present.
			expect(screen.getByLabelText("create.nameLabel")).toBeInTheDocument();
			expect(screen.getByLabelText("create.slugLabel")).toBeInTheDocument();
		});

		it("does not throw when rendered with open=true", () => {
			expect(() =>
				render(<CreateWorkspaceDialog open={true} onOpenChange={vi.fn()} />),
			).not.toThrow();
		});

		it("does not throw when rendered with open=false", () => {
			expect(() =>
				render(<CreateWorkspaceDialog open={false} onOpenChange={vi.fn()} />),
			).not.toThrow();
		});

	});

	describe("Props interface", () => {
		it("accepts onOpenChange callback without calling it on render (closed)", () => {
			const onOpenChange = vi.fn();
			render(
				<CreateWorkspaceDialog open={false} onOpenChange={onOpenChange} />,
			);
			expect(onOpenChange).not.toHaveBeenCalled();
		});

		it("accepts onOpenChange callback without calling it on render (open)", () => {
			const onOpenChange = vi.fn();
			render(<CreateWorkspaceDialog open={true} onOpenChange={onOpenChange} />);
			expect(onOpenChange).not.toHaveBeenCalled();
		});

		it("re-renders without error when open prop changes from false to true", () => {
			const onOpenChange = vi.fn();
			const { rerender } = render(
				<CreateWorkspaceDialog open={false} onOpenChange={onOpenChange} />,
			);
			expect(() =>
				rerender(
					<CreateWorkspaceDialog open={true} onOpenChange={onOpenChange} />,
				),
			).not.toThrow();
		});

		it("re-renders without error when open prop changes from true to false", () => {
			const onOpenChange = vi.fn();
			const { rerender } = render(
				<CreateWorkspaceDialog open={true} onOpenChange={onOpenChange} />,
			);
			expect(() =>
				rerender(
					<CreateWorkspaceDialog open={false} onOpenChange={onOpenChange} />,
				),
			).not.toThrow();
		});
	});
});
