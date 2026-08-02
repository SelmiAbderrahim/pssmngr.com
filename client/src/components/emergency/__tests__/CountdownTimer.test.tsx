// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * CountdownTimer Component Tests
 *
 * Covers:
 * - Countdown display for future expiration
 * - "Expired" display for past expiration
 * - onExpired callback when timer reaches zero
 * - Time formatting (days, hours, minutes, seconds)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// The component uses t("countdown.expired", "Expired"); this test asserts the
// human-readable default value. The global setup mock returns the key, so use a
// local mock that honours the i18next defaultValue contract (t(key, default)).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, def?: string) => (typeof def === "string" ? def : key),
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

import { CountdownTimer } from "../CountdownTimer";

describe("CountdownTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows countdown for a future expiration", () => {
    // 3 hours, 30 minutes from now
    render(<CountdownTimer expiresAt="2025-06-01T15:30:00Z" />);
    expect(screen.getByText(/3h.*30m/)).toBeInTheDocument();
  });

  it("shows 'Expired' when expiration is in the past", () => {
    render(<CountdownTimer expiresAt="2025-06-01T11:00:00Z" />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("includes days in countdown when more than 24h remain", () => {
    // 2 days, 5 hours from now
    render(<CountdownTimer expiresAt="2025-06-03T17:00:00Z" />);
    expect(screen.getByText(/2d.*5h/)).toBeInTheDocument();
  });

  it("shows minutes and seconds", () => {
    // 5 minutes and 30 seconds from now
    render(<CountdownTimer expiresAt="2025-06-01T12:05:30Z" />);
    expect(screen.getByText(/5m.*30s/)).toBeInTheDocument();
  });

  it("pads seconds with leading zero", () => {
    // 2 minutes and 5 seconds
    render(<CountdownTimer expiresAt="2025-06-01T12:02:05Z" />);
    expect(screen.getByText(/2m.*05s/)).toBeInTheDocument();
  });

  it("calls onExpired when timer reaches zero", () => {
    const onExpired = vi.fn();
    // 2 seconds from now
    render(<CountdownTimer expiresAt="2025-06-01T12:00:02Z" onExpired={onExpired} />);

    expect(onExpired).not.toHaveBeenCalled();

    // Advance past expiration
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onExpired).toHaveBeenCalledOnce();
  });

  it("transitions to Expired when timer runs out", () => {
    render(<CountdownTimer expiresAt="2025-06-01T12:00:02Z" />);

    // Initially shows countdown
    expect(screen.queryByText("Expired")).not.toBeInTheDocument();

    // Advance past expiration
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("does not call onExpired when already expired on mount", () => {
    const onExpired = vi.fn();
    render(<CountdownTimer expiresAt="2025-06-01T11:00:00Z" onExpired={onExpired} />);

    // The interval should fire and detect expired
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(onExpired).toHaveBeenCalled();
  });

  it("shows 0h when hours are 0 but days > 0", () => {
    // Exactly 1 day from now
    render(<CountdownTimer expiresAt="2025-06-02T12:00:00Z" />);
    expect(screen.getByText(/1d.*0h/)).toBeInTheDocument();
  });
});
