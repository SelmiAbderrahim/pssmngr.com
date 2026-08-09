// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Batch HTTP transport with sendBeacon fallback
 * Reliably sends logs to backend with batching and retry
 */

import type { LogEntry, LogTransport } from '../types';

interface BatchTransportConfig {
  endpoint: string;
  batchSize?: number;
  flushInterval?: number;
  maxRetries?: number;
  retryDelay?: number;
}

const DEFAULT_CONFIG = {
  batchSize: 10,
  flushInterval: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 1000,
};

export function createBatchTransport(
  config: BatchTransportConfig
): LogTransport {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const buffer: LogEntry[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;

  const sendLogs = async (entries: LogEntry[]): Promise<boolean> => {
    const payload = JSON.stringify({ logs: entries });

    // Try sendBeacon first (most reliable for page unload)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(finalConfig.endpoint, blob);
      if (sent) return true;
    }

    // Fallback to fetch
    try {
      const response = await fetch(finalConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payload,
        keepalive: true,
      });

      return response.ok;
    } catch {
      return false;
    }
  };

  const flush = async () => {
    if (buffer.length === 0) return;

    const entriesToSend = buffer.splice(0, buffer.length);
    const success = await sendLogs(entriesToSend);

    if (!success) {
      if (retryCount < finalConfig.maxRetries) {
        // Put entries back in buffer and retry
        buffer.unshift(...entriesToSend);
        retryCount++;

        setTimeout(() => {
          void flush();
        }, finalConfig.retryDelay * Math.pow(2, retryCount - 1));
      } else {
        // Max retries reached - store locally as fallback
        try {
          const fallbackKey = '__pssmngr_logs_failed__';
          const existingData = localStorage.getItem(fallbackKey);
          const existingEntries = existingData ? JSON.parse(existingData) : [];
          existingEntries.push(...entriesToSend);
          localStorage.setItem(fallbackKey, JSON.stringify(existingEntries.slice(-100)));
        } catch {
          // Silent fail - best effort
        }
        retryCount = 0;
      }
    } else {
      retryCount = 0;
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      void flush();
      flushTimer = null;
    }, finalConfig.flushInterval);
  };

  // Flush on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (buffer.length > 0) {
        void flush();
      }
    });

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && buffer.length > 0) {
        void flush();
      }
    });
  }

  return {
    name: 'batch',
    write: (entry: LogEntry) => {
      buffer.push(entry);

      if (buffer.length >= finalConfig.batchSize) {
        void flush();
      } else {
        scheduleFlush();
      }
    },
    flush: () => {
      void flush();
    },
  };
}
