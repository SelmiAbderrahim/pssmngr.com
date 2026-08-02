// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Main logger factory for Password Manager
 * Creates structured, privacy-compliant loggers with correlation ID support
 */

import type {
  Logger,
  LoggerConfig,
  LogContext,
  LogEntry,
  LogLevel,
  ErrorInfo,
} from './types';
import { LOG_LEVEL_PRIORITY } from './types';
import { getCorrelationId, setCorrelationId as setCorrelationIdInternal } from './correlation';
import { sanitize, hashUserIdSync } from './sanitizer';
import { createConsoleTransport } from './transports/console';
import { createLocalStorageTransport } from './transports/localStorage';

const DEFAULT_MIN_LEVEL: LogLevel = 'INFO';

function getAppVersion(): string {
  return import.meta.env.VITE_APP_VERSION || '1.0.0';
}

function getEnvironment(): string {
  if (import.meta.env.PROD) return 'production';
  if (import.meta.env.MODE === 'test') return 'test';
  return 'development';
}

function getUserAgent(): string {
  if (typeof navigator !== 'undefined') {
    return navigator.userAgent;
  }
  return 'unknown';
}

function getHostname(): string {
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  return 'unknown';
}

function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[minLevel];
}

function createErrorInfo(error: Error | ErrorInfo): ErrorInfo {
  if (error instanceof Error) {
    // Build ErrorInfo conditionally to satisfy exactOptionalPropertyTypes
    const errorInfo: ErrorInfo = {
      name: error.name,
      message: error.message,
    };
    if (error.stack !== undefined) errorInfo.stack = error.stack;
    const errorWithCode = error as Error & { code?: string | number };
    if (errorWithCode.code !== undefined) errorInfo.code = errorWithCode.code;
    return errorInfo;
  }
  return error;
}

function createLogEntry(
  level: LogLevel,
  service: string,
  message: string,
  context: LogContext,
  correlationId: string,
  defaultContext: Record<string, unknown>
): LogEntry {
  const { function: fn = 'unknown', error, performance, userId, ...restContext } = context;

  const sanitizedContext = sanitize({
    ...defaultContext,
    ...restContext,
  }) as Record<string, unknown>;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: service as LogEntry['service'],
    function: fn,
    correlationId,
    message,
    context: sanitizedContext,
    metadata: {
      environment: getEnvironment(),
      version: getAppVersion(),
      hostname: getHostname(),
      userAgent: getUserAgent(),
    },
  };

  if (error) {
    const errorInfo = error instanceof Error ? createErrorInfo(error) : error;
    entry.error = sanitize(errorInfo) as ErrorInfo;
  }

  if (performance) {
    entry.performance = performance;
  }

  if (userId) {
    entry.userId = hashUserIdSync(userId);
  }

  return entry;
}

export function createLogger(config: LoggerConfig): Logger {
  const {
    service,
    minLevel = DEFAULT_MIN_LEVEL,
    transports = [createConsoleTransport(), createLocalStorageTransport()],
    defaultContext = {},
  } = config;

  let currentCorrelationId = getCorrelationId();

  const writeToTransports = (entry: LogEntry) => {
    for (const transport of transports) {
      try {
        void transport.write(entry);
      } catch {
        // Fallback to console if transport fails
        console.error(`[Logger] Transport ${transport.name} failed:`, entry);
      }
    }
  };

  const log = (level: LogLevel, message: string, context: LogContext = {}) => {
    if (!shouldLog(level, minLevel)) return;

    const entry = createLogEntry(
      level,
      service,
      message,
      context,
      currentCorrelationId,
      defaultContext
    );

    writeToTransports(entry);
  };

  const logger: Logger = {
    error: (message: string, context?: LogContext) => log('ERROR', message, context),
    warn: (message: string, context?: LogContext) => log('WARN', message, context),
    info: (message: string, context?: LogContext) => log('INFO', message, context),
    debug: (message: string, context?: LogContext) => log('DEBUG', message, context),
    trace: (message: string, context?: LogContext) => log('TRACE', message, context),

    child: (childContext: Record<string, unknown>) => {
      return createLogger({
        service,
        minLevel,
        transports,
        defaultContext: { ...defaultContext, ...childContext },
      });
    },

    setCorrelationId: (id: string) => {
      currentCorrelationId = id;
      setCorrelationIdInternal(id);
    },

    getCorrelationId: () => currentCorrelationId,
  };

  return logger;
}

// Singleton logger instance for the application
let globalLogger: Logger | null = null;

export function initializeLogger(config?: Partial<LoggerConfig>): Logger {
  const defaultConfig: LoggerConfig = {
    service: 'frontend',
    minLevel: import.meta.env.DEV ? 'DEBUG' : 'INFO',
    transports: [createConsoleTransport(), createLocalStorageTransport()],
    defaultContext: {},
  };

  globalLogger = createLogger({ ...defaultConfig, ...config });
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = initializeLogger();
  }
  return globalLogger;
}

// Re-export types and utilities
export * from './types';
export * from './correlation';
export * from './sanitizer';
export { createConsoleTransport } from './transports/console';
export { createLocalStorageTransport, getStoredLogs, clearStoredLogs } from './transports/localStorage';
export { createBatchTransport } from './transports/batch';
