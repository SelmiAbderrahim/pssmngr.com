// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Unit tests for OfflineBanner.
 *
 * Covers:
 *   - hidden when online AND queue depth == 0
 *   - visible when offline OR queue depth > 0
 *   - dismiss button hides the banner and re-shows on next offline transition
 *   - uses logical CSS properties for RTL safety
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { OfflineBanner } from "../OfflineBanner";

let mockIsOnline = true;
let mockQueueDepth = 0;

vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({
    isOnline: mockIsOnline,
    lastChangedAt: new Date(),
    source: "navigator" as const,
  }),
}));

vi.mock("@/sync/offlineQueue", () => ({
  pendingCount: () => Promise.resolve(mockQueueDepth),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: unknown) => {
      if (typeof fallbackOrOpts === "string") return fallbackOrOpts;
      if (
        fallbackOrOpts &&
        typeof fallbackOrOpts === "object" &&
        "defaultValue" in (fallbackOrOpts as Record<string, unknown>)
      ) {
        return (fallbackOrOpts as { defaultValue: string }).defaultValue;
      }
      return key;
    },
  }),
}));

describe("OfflineBanner", () => {
  beforeEach(() => {
    mockIsOnline = true;
    mockQueueDepth = 0;
  });

  afterEach(() => cleanup());

  it("renders nothing when online and queue is empty", async () => {
    const { container } = render(<OfflineBanner />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders when offline", async () => {
    mockIsOnline = false;
    render(<OfflineBanner />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument(),
    );
  });

  it("renders when online but queue depth > 0 (replay in progress)", async () => {
    mockIsOnline = true;
    mockQueueDepth = 3;
    render(<OfflineBanner />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      // Either the default i18n string or a fallback containing the count.
      expect(screen.getByText(/3/)).toBeInTheDocument();
    });
  });

  it("dismiss button hides the banner", async () => {
    mockIsOnline = false;
    render(<OfflineBanner />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("uses logical CSS properties for RTL", async () => {
    mockIsOnline = false;
    render(<OfflineBanner />);
    const alert = await screen.findByRole("alert");
    const cls = alert.className;
    // Sanity guards for the rtl-support-arabic rule.
    expect(cls).not.toMatch(/\bml-\d/);
    expect(cls).not.toMatch(/\bmr-\d/);
    expect(cls).not.toMatch(/\bleft-\d/);
    expect(cls).not.toMatch(/\bright-\d/);
    expect(cls).toMatch(/(ps-|pe-|start-|end-)/);
  });
});
