// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePageTracking, useWebVitals } from "../index";

describe("analytics hooks", () => {
  it("exposes page tracking as a React hook", () => {
    expect(typeof usePageTracking).toBe("function");
    expect(() => renderHook(() => usePageTracking())).not.toThrow();
  });

  it("exposes privacy-conscious web-vitals tracking as a React hook", () => {
    expect(typeof useWebVitals).toBe("function");
    expect(() => renderHook(() => useWebVitals())).not.toThrow();
  });
});
