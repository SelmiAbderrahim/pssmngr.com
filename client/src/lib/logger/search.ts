// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Log search and analysis utilities
 * Provides filtering, statistics, and export capabilities
 */

import type { LogEntry, LogLevel, LogSearchFilters, LogSearchResult, LogStats } from './types';
import { getStoredLogs, clearStoredLogs } from './transports/localStorage';

export class LogSearcher {
  private entries: LogEntry[];
  private storageKey: string;

  constructor(storageKey = '__pssmngr_logs__') {
    this.storageKey = storageKey;
    this.entries = getStoredLogs(storageKey);
  }

  refresh(): void {
    this.entries = getStoredLogs(this.storageKey);
  }

  search(filters: LogSearchFilters): LogSearchResult {
    this.refresh();
    let filtered = [...this.entries];

    // Filter by level
    if (filters.level) {
      const levels = Array.isArray(filters.level) ? filters.level : [filters.level];
      filtered = filtered.filter((entry) => levels.includes(entry.level));
    }

    // Filter by service
    if (filters.service) {
      const services = Array.isArray(filters.service) ? filters.service : [filters.service];
      filtered = filtered.filter((entry) => services.includes(entry.service));
    }

    // Filter by function name (substring match)
    if (filters.function) {
      const fn = filters.function.toLowerCase();
      filtered = filtered.filter((entry) => entry.function.toLowerCase().includes(fn));
    }

    // Filter by correlation ID
    if (filters.correlationId) {
      const correlationId = filters.correlationId;
      filtered = filtered.filter((entry) =>
        entry.correlationId.includes(correlationId)
      );
    }

    // Filter by time range
    if (filters.startTime) {
      const start = new Date(filters.startTime).getTime();
      filtered = filtered.filter((entry) => new Date(entry.timestamp).getTime() >= start);
    }

    if (filters.endTime) {
      const end = new Date(filters.endTime).getTime();
      filtered = filtered.filter((entry) => new Date(entry.timestamp).getTime() <= end);
    }

    // Filter by message content
    if (filters.message) {
      const msg = filters.message.toLowerCase();
      filtered = filtered.filter((entry) => entry.message.toLowerCase().includes(msg));
    }

    // Filter by user ID
    if (filters.userId) {
      filtered = filtered.filter((entry) => entry.userId === filters.userId);
    }

    return {
      entries: filtered,
      total: this.entries.length,
      filtered: filtered.length,
    };
  }

  getErrorLogs(): LogEntry[] {
    this.refresh();
    return this.entries.filter((entry) => entry.level === 'ERROR');
  }

  getRecentLogs(count = 50): LogEntry[] {
    this.refresh();
    return this.entries.slice(-count);
  }

  getLogsByCorrelationId(correlationId: string): LogEntry[] {
    this.refresh();
    return this.entries.filter((entry) => entry.correlationId === correlationId);
  }

  getStats(): LogStats {
    this.refresh();

    const byLevel: Record<LogLevel, number> = {
      ERROR: 0,
      WARN: 0,
      INFO: 0,
      DEBUG: 0,
      TRACE: 0,
    };

    const byService: Record<string, number> = {
      frontend: 0,
    };

    for (const entry of this.entries) {
      byLevel[entry.level]++;
      const serviceCount = byService[entry.service];
      if (serviceCount !== undefined) {
        byService[entry.service] = serviceCount + 1;
      }
    }

    // Build result conditionally to satisfy exactOptionalPropertyTypes
    const result: LogStats = {
      total: this.entries.length,
      byLevel,
      byService: byService as Record<LogEntry['service'], number>,
    };
    const oldest = this.entries[0];
    const newest = this.entries[this.entries.length - 1];
    if (oldest) result.oldestEntry = oldest.timestamp;
    if (newest) result.newestEntry = newest.timestamp;
    return result;
  }

  exportToJSON(): string {
    this.refresh();
    return JSON.stringify(this.entries, null, 2);
  }

  exportToCSV(): string {
    this.refresh();
    if (this.entries.length === 0) return '';

    const headers = ['timestamp', 'level', 'service', 'function', 'correlationId', 'message'];
    const rows = this.entries.map((entry) =>
      headers.map((h) => {
        const value = entry[h as keyof LogEntry];
        const str = typeof value === 'object' ? JSON.stringify(value) : String(value || '');
        return `"${str.replace(/"/g, '""')}"`;
      })
    );

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  clear(): void {
    clearStoredLogs(this.storageKey);
    this.entries = [];
  }
}

// Singleton instance
let globalSearcher: LogSearcher | null = null;

export function getLogSearcher(): LogSearcher {
  if (!globalSearcher) {
    globalSearcher = new LogSearcher();
  }
  return globalSearcher;
}
