// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Global Console Override
 *
 * Overrides native console methods to respect DEBUG_LEVEL environment variable.
 * This ensures ALL console output (including from third-party libraries) is filtered.
 *
 * Must be called BEFORE any other code that might log to console.
 */

type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
};

// Store original console methods for restoration if needed
const originalConsole = {
  log: console.log.bind(console),
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  trace: console.trace.bind(console),
};

/**
 * Override console methods to filter by log level
 * @param minLevel - Minimum log level to display (ERROR, WARN, INFO, DEBUG, TRACE)
 */
export function overrideConsole(minLevel: string): void {
  const level = minLevel.toUpperCase() as LogLevel;
  const minPriority = LOG_LEVEL_PRIORITY[level] ?? LOG_LEVEL_PRIORITY.INFO;

  // TRACE level (priority 4) - only show if minLevel is TRACE
  console.trace = minPriority >= 4 ? originalConsole.trace : () => {};

  // DEBUG level (priority 3) - show if minLevel is DEBUG or TRACE
  console.debug = minPriority >= 3 ? originalConsole.debug : () => {};

  // LOG is treated as DEBUG level
  console.log = minPriority >= 3 ? originalConsole.log : () => {};

  // INFO level (priority 2) - show if minLevel is INFO, DEBUG, or TRACE
  console.info = minPriority >= 2 ? originalConsole.info : () => {};

  // WARN level (priority 1) - show if minLevel is WARN or higher
  console.warn = minPriority >= 1 ? originalConsole.warn : () => {};

  // ERROR level (priority 0) - always shown
  // console.error is never overridden
}

/**
 * Restore original console methods
 */
export function restoreConsole(): void {
  console.log = originalConsole.log;
  console.debug = originalConsole.debug;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.trace = originalConsole.trace;
}

/**
 * Get the current minimum log level from environment
 */
export function getDebugLevel(): string {
  if (typeof window !== 'undefined') {
    // Browser environment - use Vite env
    return (import.meta.env.VITE_DEBUG_LEVEL?.toUpperCase() as string) || 'ERROR';
  }
  // Node environment
  return process.env.DEBUG_LEVEL?.toUpperCase() || 'ERROR';
}
