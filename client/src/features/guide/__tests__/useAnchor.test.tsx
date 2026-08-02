// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANCHOR_TIMEOUT_MS, useAnchor } from "../hooks/useAnchor";

describe("useAnchor", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    if (!window.matchMedia) {
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as any;
    }
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("returns 'searching' when inactive", () => {
    const { result } = renderHook(() => useAnchor("nope", false));
    expect(result.current.status).toBe("searching");
  });

  it("finds an already-present anchor", async () => {
    const el = document.createElement("button");
    el.setAttribute("data-tour", "vault-add-item");
    document.body.appendChild(el);
    const { result } = renderHook(() => useAnchor("vault-add-item", true));
    await waitFor(() => expect(result.current.status).toBe("found"));
    expect(result.current.rect).not.toBeNull();
  });

  it("waits for a late-appearing anchor via MutationObserver", async () => {
    const { result } = renderHook(() => useAnchor("late", true));
    expect(result.current.status).toBe("searching");
    await act(async () => {
      const el = document.createElement("div");
      el.setAttribute("data-tour", "late");
      document.body.appendChild(el);
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.status).toBe("found"));
  });

  it("times out to 'missing' after ANCHOR_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAnchor("ghost", true));
    await act(async () => {
      vi.advanceTimersByTime(ANCHOR_TIMEOUT_MS + 10);
    });
    expect(result.current.status).toBe("missing");
  });

  it("re-emits 'missing' after the anchor is removed mid-step", async () => {
    const el = document.createElement("div");
    el.setAttribute("data-tour", "removable");
    document.body.appendChild(el);
    const { result } = renderHook(() => useAnchor("removable", true));
    await waitFor(() => expect(result.current.status).toBe("found"));
    document.body.removeChild(el);
    // Trigger the tracked resize handler → status flips to 'missing'.
    window.dispatchEvent(new Event("resize"));
    await waitFor(() => expect(result.current.status).toBe("missing"));
  });

  it("resets to 'searching' on target change while inactive→active", () => {
    const { result, rerender } = renderHook(
      ({ t, a }: { t: string; a: boolean }) => useAnchor(t, a),
      { initialProps: { t: "x", a: false } },
    );
    expect(result.current.status).toBe("searching");
    rerender({ t: "x", a: true });
    expect(result.current.status).toBe("searching");
  });
});
