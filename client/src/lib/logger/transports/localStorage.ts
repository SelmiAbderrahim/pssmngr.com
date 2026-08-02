// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * LocalStorage transport with automatic rotation
 * Stores logs in browser for search, filter, and export
 */

import type { LogEntry, LogTransport } from '../types';

interface LocalStorageTransportConfig {
  maxEntries?: number;
  storageKey?: string;
  flushInterval?: number;
}

const DEFAULT_CONFIG: LocalStorageTransportConfig = {
  maxEntries: 1000,
  storageKey: '__pssmngr_logs__',
  flushInterval: 5000, // 5 seconds
};

export function createLocalStorageTransport(
  config: LocalStorageTransportConfig = {}
): LogTransport {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const storageKey = finalConfig.storageKey as string; // Guaranteed by defaults
  const maxEntries = finalConfig.maxEntries as number; // Guaranteed by defaults
  const buffer: LogEntry[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (buffer.length === 0) return;
    if (typeof localStorage === 'undefined') return;

    try {
      const existingData = localStorage.getItem(storageKey);
      let entries: LogEntry[] = existingData ? JSON.parse(existingData) : [];

      // Add buffered entries
      entries.push(...buffer);

      // Rotate if exceeds max
      if (entries.length > maxEntries) {
        entries = entries.slice(entries.length - maxEntries);
      }

      localStorage.setItem(storageKey, JSON.stringify(entries));
      buffer.length = 0;
    } catch (error) {
      // Storage quota exceeded or parse error - clear and start fresh
      try {
        localStorage.setItem(storageKey, JSON.stringify(buffer));
        buffer.length = 0;
      } catch {
        // Complete failure - just clear buffer to prevent memory issues
        buffer.length = 0;
      }
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flush();
      flushTimer = null;
    }, finalConfig.flushInterval);
  };

  return {
    name: 'localStorage',
    write: (entry: LogEntry) => {
      buffer.push(entry);

      // Immediate flush if buffer gets too large
      if (buffer.length >= 50) {
        flush();
      } else {
        scheduleFlush();
      }
    },
    flush,
  };
}

/**
 * Retrieves all logs from localStorage
 */
export function getStoredLogs(
  storageKey = '__pssmngr_logs__'
): LogEntry[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const data = localStorage.getItem(storageKey);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Clears all stored logs
 */
export function clearStoredLogs(
  storageKey = '__pssmngr_logs__'
): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(storageKey);
  }
}

/**
 * Gets the size of stored logs in bytes
 */
export function getStoredLogsSize(
  storageKey = '__pssmngr_logs__'
): number {
  if (typeof localStorage === 'undefined') return 0;

  try {
    const data = localStorage.getItem(storageKey);
    return data ? new Blob([data]).size : 0;
  } catch {
    return 0;
  }
}
