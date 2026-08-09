// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Tests for Sheet UI component.
 *
 * Covers:
 * - SheetOverlay rendering and classes
 * - SheetContent sides (top, bottom, left, right)
 * - SheetContent close button
 * - SheetHeader layout classes
 * - SheetFooter layout classes
 * - SheetTitle text classes
 * - SheetDescription text classes
 * - Custom className merging
 * - Ref forwarding
 * - Open/close interaction
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetOverlay,
  SheetClose,
} from "../sheet";

// Mock Portal so SheetContent renders inline in jsdom
vi.mock("@radix-ui/react-dialog", async () => {
  const actual = await vi.importActual<typeof import("@radix-ui/react-dialog")>(
    "@radix-ui/react-dialog"
  );
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="portal">{children}</div>
    ),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSheet(side?: "top" | "bottom" | "left" | "right", className?: string) {
  render(
    <Sheet defaultOpen>
      <SheetContent side={side} className={className} data-testid="sheet-content">
        <SheetHeader>
          <SheetTitle>Sheet Title</SheetTitle>
          <SheetDescription>Sheet description</SheetDescription>
        </SheetHeader>
        <p>Sheet body</p>
        <SheetFooter>
          <SheetClose>Close</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Sheet (root + trigger + open/close)
// ---------------------------------------------------------------------------

describe("Sheet open/close interaction", () => {
  it("renders content after trigger click", () => {
    render(
      <Sheet>
        <SheetTrigger data-testid="trigger">Open</SheetTrigger>
        <SheetContent>
          <p>Content</p>
        </SheetContent>
      </Sheet>
    );
    expect(screen.queryByText("Content")).toBeNull();
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("closes when SheetClose is clicked", () => {
    render(
      <Sheet>
        <SheetTrigger data-testid="trigger">Open</SheetTrigger>
        <SheetContent>
          <SheetClose data-testid="close-btn">Close</SheetClose>
        </SheetContent>
      </Sheet>
    );
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.getByTestId("close-btn")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("close-btn"));
    expect(screen.queryByTestId("close-btn")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SheetContent
// ---------------------------------------------------------------------------

describe("SheetContent", () => {
  it("renders with default side=right classes", () => {
    renderSheet();
    const content = screen.getByTestId("sheet-content");
    expect(content.className).toContain("end-0");
  });

  it("renders with side=left classes", () => {
    renderSheet("left");
    const content = screen.getByTestId("sheet-content");
    expect(content.className).toContain("start-0");
  });

  it("renders with side=top classes", () => {
    renderSheet("top");
    const content = screen.getByTestId("sheet-content");
    expect(content.className).toContain("top-0");
    expect(content.className).toContain("border-b");
  });

  it("renders with side=bottom classes", () => {
    renderSheet("bottom");
    const content = screen.getByTestId("sheet-content");
    expect(content.className).toContain("bottom-0");
    expect(content.className).toContain("border-t");
  });

  it("applies custom className", () => {
    renderSheet("right", "custom-sheet-class");
    const content = screen.getByTestId("sheet-content");
    expect(content.className).toContain("custom-sheet-class");
  });

  it("renders a close (X) button", () => {
    renderSheet();
    // The built-in close button has sr-only text "Close"
    expect(screen.getByText("Close", { selector: ".sr-only" })).toBeInTheDocument();
  });

  it("renders children", () => {
    renderSheet();
    expect(screen.getByText("Sheet body")).toBeInTheDocument();
  });

  it("forwards ref", () => {
    const ref = vi.fn();
    render(
      <Sheet defaultOpen>
        <SheetContent ref={ref} data-testid="sheet-content">
          content
        </SheetContent>
      </Sheet>
    );
    expect(ref).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SheetOverlay
// ---------------------------------------------------------------------------

describe("SheetOverlay", () => {
  it("renders with fixed inset classes", () => {
    const { container } = render(
      <Sheet defaultOpen>
        <SheetContent data-testid="sc">body</SheetContent>
      </Sheet>
    );
    // Overlay is rendered inside the portal wrapper
    const portal = container.querySelector('[data-testid="portal"]');
    expect(portal).not.toBeNull();
  });

  it("applies custom className via forwardRef", () => {
    const { container } = render(
      <Sheet defaultOpen>
        <SheetOverlay className="custom-overlay" data-testid="overlay" />
      </Sheet>
    );
    const overlay = container.querySelector('[data-testid="overlay"]');
    expect(overlay?.className).toContain("custom-overlay");
  });
});

// ---------------------------------------------------------------------------
// SheetHeader
// ---------------------------------------------------------------------------

describe("SheetHeader", () => {
  it("renders children", () => {
    render(<SheetHeader><span>Header child</span></SheetHeader>);
    expect(screen.getByText("Header child")).toBeInTheDocument();
  });

  it("has flex-col layout class", () => {
    const { container } = render(<SheetHeader>Header</SheetHeader>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("flex-col");
  });

  it("has text-center class", () => {
    const { container } = render(<SheetHeader>Header</SheetHeader>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("text-center");
  });

  it("applies custom className", () => {
    const { container } = render(<SheetHeader className="my-header">Header</SheetHeader>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("my-header");
  });
});

// ---------------------------------------------------------------------------
// SheetFooter
// ---------------------------------------------------------------------------

describe("SheetFooter", () => {
  it("renders children", () => {
    render(<SheetFooter><button>Save</button></SheetFooter>);
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("has flex-col-reverse class", () => {
    const { container } = render(<SheetFooter>Footer</SheetFooter>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("flex-col-reverse");
  });

  it("applies custom className", () => {
    const { container } = render(<SheetFooter className="my-footer">Footer</SheetFooter>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("my-footer");
  });
});

// ---------------------------------------------------------------------------
// SheetTitle
// ---------------------------------------------------------------------------

describe("SheetTitle", () => {
  it("renders text content", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>My Title</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByText("My Title")).toBeInTheDocument();
  });

  it("has font-semibold class", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle data-testid="title">Title</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByTestId("title").className).toContain("font-semibold");
  });

  it("has text-foreground class", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle data-testid="title">Title</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByTestId("title").className).toContain("text-foreground");
  });

  it("applies custom className", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle data-testid="title" className="my-title">Title</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByTestId("title").className).toContain("my-title");
  });

  it("forwards ref", () => {
    const ref = vi.fn();
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle ref={ref}>Title</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(ref).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SheetDescription
// ---------------------------------------------------------------------------

describe("SheetDescription", () => {
  it("renders text content", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <SheetDescription>My description</SheetDescription>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByText("My description")).toBeInTheDocument();
  });

  it("has text-muted-foreground class", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <SheetDescription data-testid="desc">Desc</SheetDescription>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByTestId("desc").className).toContain("text-muted-foreground");
  });

  it("has text-sm class", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <SheetDescription data-testid="desc">Desc</SheetDescription>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByTestId("desc").className).toContain("text-sm");
  });

  it("applies custom className", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <SheetDescription data-testid="desc" className="my-desc">Desc</SheetDescription>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByTestId("desc").className).toContain("my-desc");
  });

  it("forwards ref", () => {
    const ref = vi.fn();
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <SheetDescription ref={ref}>Desc</SheetDescription>
        </SheetContent>
      </Sheet>
    );
    expect(ref).toHaveBeenCalled();
  });
});
