// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Console transport with color-coded output
 * Supports structured JSON in production, pretty print in development
 */

import type { LogEntry, LogTransport } from '../types';
import { LOG_LEVEL_COLORS } from '../types';

interface ConsoleTransportConfig {
  colorize?: boolean;
  prettyPrint?: boolean;
  includeTimestamp?: boolean;
}

const DEFAULT_CONFIG: ConsoleTransportConfig = {
  colorize: true,
  prettyPrint: import.meta.env.DEV,
  includeTimestamp: true,
};

export function createConsoleTransport(
  config: ConsoleTransportConfig = {}
): LogTransport {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    name: 'console',
    write: (entry: LogEntry) => {
      const { level, message, function: fn, correlationId, context, error } = entry;

      if (finalConfig.prettyPrint) {
        // Development: Pretty, readable output
        const timestamp = finalConfig.includeTimestamp
          ? new Date(entry.timestamp).toLocaleTimeString()
          : '';

        const prefix = `[${timestamp}] [${level}] [${fn}]`;
        const correlationInfo = `(${correlationId.substring(0, 8)})`;

        const style = finalConfig.colorize
          ? `color: ${LOG_LEVEL_COLORS[level]}; font-weight: bold;`
          : '';

        const consoleMethod = getConsoleMethod(level);

        if (error) {
          consoleMethod(
            `%c${prefix} ${correlationInfo}`,
            style,
            message,
            '\nContext:',
            context,
            '\nError:',
            error
          );
        } else if (Object.keys(context).length > 0) {
          consoleMethod(
            `%c${prefix} ${correlationInfo}`,
            style,
            message,
            '\nContext:',
            context
          );
        } else {
          consoleMethod(`%c${prefix} ${correlationInfo}`, style, message);
        }
      } else {
        // Production: Structured JSON output
        const consoleMethod = getConsoleMethod(level);
        consoleMethod(JSON.stringify(entry));
      }
    },
  };
}

function getConsoleMethod(level: string): (...args: unknown[]) => void {
  switch (level) {
    case 'ERROR':
      return console.error.bind(console);
    case 'WARN':
      return console.warn.bind(console);
    case 'INFO':
      return console.info.bind(console);
    case 'DEBUG':
      return console.debug.bind(console);
    case 'TRACE':
      return console.trace.bind(console);
    default:
      return console.log.bind(console);
  }
}
