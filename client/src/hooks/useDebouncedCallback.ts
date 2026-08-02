// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useDebouncedCallback Hook
 *
 * Creates a debounced version of a callback function.
 * The callback will only be executed after the specified delay has passed
 * since the last invocation.
 *
 * @module hooks/useDebouncedCallback
 */

import { useCallback, useRef, useEffect } from "react";

/**
 * Creates a debounced callback function.
 *
 * @template T - The type of arguments the callback accepts
 * @param callback - The function to debounce
 * @param delay - The delay in milliseconds before the callback is executed
 * @returns Object containing the debounced function and control methods
 *
 * @example
 * ```tsx
 * const { debouncedCallback, cancel, flush } = useDebouncedCallback(
 *   async (value: string) => {
 *     await saveSettings({ name: value });
 *   },
 *   500
 * );
 *
 * // Call the debounced function
 * debouncedCallback("new value");
 *
 * // Cancel pending execution
 * cancel();
 *
 * // Execute immediately without waiting
 * flush();
 * ```
 */
export function useDebouncedCallback<T extends unknown[]>(
  callback: (...args: T) => void | Promise<void>,
  delay: number
): {
  debouncedCallback: (...args: T) => void;
  cancel: () => void;
  flush: () => void;
  isPending: () => boolean;
} {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const pendingArgsRef = useRef<T | null>(null);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingArgsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timeoutRef.current && pendingArgsRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      const args = pendingArgsRef.current;
      pendingArgsRef.current = null;
      callbackRef.current(...args);
    }
  }, []);

  const isPending = useCallback(() => {
    return timeoutRef.current !== null;
  }, []);

  const debouncedCallback = useCallback(
    (...args: T) => {
      // Cancel any pending execution
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Store the arguments
      pendingArgsRef.current = args;

      // Schedule new execution
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        pendingArgsRef.current = null;
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );

  return {
    debouncedCallback,
    cancel,
    flush,
    isPending,
  };
}

export default useDebouncedCallback;
