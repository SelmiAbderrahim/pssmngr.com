// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * DevTools console commands for log management
 * Provides developer-friendly utilities in browser console
 */

import { getLogSearcher } from './search';
import type { LogSearchFilters } from './types';

interface DevToolsAPI {
  search: (filters: LogSearchFilters) => ReturnType<typeof import('./search').LogSearcher.prototype.search>;
  errors: () => ReturnType<typeof import('./search').LogSearcher.prototype.getErrorLogs>;
  recent: (count?: number) => ReturnType<typeof import('./search').LogSearcher.prototype.getRecentLogs>;
  export: () => string;
  exportCSV: () => string;
  clear: () => void;
  stats: () => ReturnType<typeof import('./search').LogSearcher.prototype.getStats>;
  trace: (correlationId: string) => ReturnType<typeof import('./search').LogSearcher.prototype.getLogsByCorrelationId>;
  help: () => void;
}

declare global {
  interface Window {
    __LOGS__: DevToolsAPI;
  }
}

export function setupDevToolsCommands(): void {
  if (typeof window === 'undefined') return;

  const searcher = getLogSearcher();

  window.__LOGS__ = {
    search: (filters: LogSearchFilters) => searcher.search(filters),
    errors: () => searcher.getErrorLogs(),
    recent: (count = 50) => searcher.getRecentLogs(count),
    export: () => {
      const json = searcher.exportToJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return `Exported ${searcher.getStats().total} log entries`;
    },
    exportCSV: () => {
      const csv = searcher.exportToCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${new Date().toISOString()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return `Exported ${searcher.getStats().total} log entries`;
    },
    clear: () => {
      searcher.clear();
      console.info('[Logs] All logs cleared');
    },
    stats: () => searcher.getStats(),
    trace: (correlationId: string) => searcher.getLogsByCorrelationId(correlationId),
    help: () => {
      console.info(`
Password Manager Log Management Commands:

__LOGS__.search(filters)     - Search logs with filters
  Example: __LOGS__.search({ level: 'ERROR', service: 'frontend' })
  Filters: level, service, function, correlationId, startTime, endTime, message, userId

__LOGS__.errors()            - Get all ERROR level logs
__LOGS__.recent(count)       - Get recent logs (default: 50)
__LOGS__.trace(correlationId) - Trace all logs for a correlation ID
__LOGS__.stats()             - Get log statistics
__LOGS__.export()            - Export logs to JSON file
__LOGS__.exportCSV()         - Export logs to CSV file
__LOGS__.clear()             - Clear all stored logs
__LOGS__.help()              - Show this help message

Examples:
  __LOGS__.search({ level: ['ERROR', 'WARN'] })
  __LOGS__.search({ function: 'login', startTime: new Date('2024-01-01') })
  __LOGS__.trace('a1b2c3d4')
      `);
    },
  };

  console.info('[Logs] DevTools commands available. Type __LOGS__.help() for usage.');
}
