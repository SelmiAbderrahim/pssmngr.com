// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useDebounce } from "../useDebounce";

describe("useDebounce Hook", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns initial value immediately", () => {
		const { result } = renderHook(() => useDebounce("initial", 300));

		expect(result.current).toBe("initial");
	});

	it("debounces value changes", () => {
		const { result, rerender } = renderHook(
			({ value, delay }) => useDebounce(value, delay),
			{ initialProps: { value: "initial", delay: 300 } },
		);

		expect(result.current).toBe("initial");

		rerender({ value: "updated", delay: 300 });

		// Should still be initial immediately after rerender
		expect(result.current).toBe("initial");

		// Fast-forward time past the delay
		act(() => {
			vi.advanceTimersByTime(300);
		});

		// Now should be updated
		expect(result.current).toBe("updated");
	});

	it("cancels previous timeout on rapid changes", () => {
		const { result, rerender } = renderHook(
			({ value, delay }) => useDebounce(value, delay),
			{ initialProps: { value: "v1", delay: 300 } },
		);

		rerender({ value: "v2", delay: 300 });
		act(() => {
			vi.advanceTimersByTime(100);
		});

		rerender({ value: "v3", delay: 300 });
		act(() => {
			vi.advanceTimersByTime(100);
		});

		rerender({ value: "v4", delay: 300 });
		act(() => {
			vi.advanceTimersByTime(100);
		});

		// Still v1 because timer keeps resetting with each rerender
		expect(result.current).toBe("v1");

		// Fast-forward full delay from last change
		act(() => {
			vi.advanceTimersByTime(300);
		});

		// Should have the final value only
		expect(result.current).toBe("v4");
	});

	it("handles different delay values (500ms)", () => {
		const { result, rerender } = renderHook(
			({ value, delay }) => useDebounce(value, delay),
			{ initialProps: { value: "initial", delay: 500 } },
		);

		rerender({ value: "updated", delay: 500 });

		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(result.current).toBe("initial");

		act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(result.current).toBe("updated");
	});

	it("handles zero delay", () => {
		const { result, rerender } = renderHook(
			({ value, delay }) => useDebounce(value, delay),
			{ initialProps: { value: "initial", delay: 0 } },
		);

		rerender({ value: "updated", delay: 0 });

		act(() => {
			vi.advanceTimersByTime(0);
		});
		expect(result.current).toBe("updated");
	});

	it("works with number type", () => {
		const { result } = renderHook(() => useDebounce(42, 100));
		expect(result.current).toBe(42);
	});

	it("works with object type", () => {
		const obj = { a: 1 };
		const { result } = renderHook(() => useDebounce(obj, 100));
		expect(result.current).toBe(obj);
	});

	it("works with undefined type", () => {
		const { result } = renderHook(() => useDebounce(undefined, 100));
		expect(result.current).toBeUndefined();
	});

	it("updates debounced value for number after delay", () => {
		const { result, rerender } = renderHook(
			({ value, delay }) => useDebounce(value, delay),
			{ initialProps: { value: 10, delay: 200 } },
		);

		rerender({ value: 20, delay: 200 });

		expect(result.current).toBe(10);

		act(() => {
			vi.advanceTimersByTime(200);
		});

		expect(result.current).toBe(20);
	});

	it("cleans up timeout on unmount", () => {
		const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

		const { unmount, rerender } = renderHook(
			({ value, delay }) => useDebounce(value, delay),
			{ initialProps: { value: "initial", delay: 300 } },
		);

		rerender({ value: "updated", delay: 300 });
		unmount();

		expect(clearTimeoutSpy).toHaveBeenCalled();
		clearTimeoutSpy.mockRestore();
	});
});
