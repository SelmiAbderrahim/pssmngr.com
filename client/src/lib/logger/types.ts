// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Structured logging types for Password Manager
 * Provides type-safe logging with correlation IDs and privacy compliance
 */

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';

export type ServiceType = 'frontend';

export interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
}

export interface PerformanceInfo {
  duration?: number;
  memoryUsage?: number;
  renderCount?: number;
}

export interface MetadataInfo {
  environment: string;
  version: string;
  hostname?: string;
  userAgent?: string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: ServiceType;
  function: string;
  correlationId: string;
  message: string;
  context: Record<string, unknown>;
  userId?: string;
  error?: ErrorInfo;
  performance?: PerformanceInfo;
  metadata: MetadataInfo;
}

export interface LoggerConfig {
  service: ServiceType;
  minLevel?: LogLevel;
  transports?: LogTransport[];
  defaultContext?: Record<string, unknown>;
}

export interface LogTransport {
  name: string;
  write: (entry: LogEntry) => void | Promise<void>;
  flush?: () => void | Promise<void>;
}

export interface Logger {
  error: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  debug: (message: string, context?: LogContext) => void;
  trace: (message: string, context?: LogContext) => void;
  child: (defaultContext: Record<string, unknown>) => Logger;
  setCorrelationId: (id: string) => void;
  getCorrelationId: () => string;
}

export interface LogContext {
  function?: string;
  error?: Error | ErrorInfo;
  performance?: PerformanceInfo;
  userId?: string;
  [key: string]: unknown;
}

export interface LogSearchFilters {
  level?: LogLevel | LogLevel[];
  service?: ServiceType | ServiceType[];
  function?: string;
  correlationId?: string;
  startTime?: Date | string;
  endTime?: Date | string;
  message?: string;
  userId?: string;
}

export interface LogSearchResult {
  entries: LogEntry[];
  total: number;
  filtered: number;
}

export interface LogStats {
  total: number;
  byLevel: Record<LogLevel, number>;
  byService: Record<ServiceType, number>;
  oldestEntry?: string;
  newestEntry?: string;
}

export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
};

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  ERROR: '#ff4444',
  WARN: '#ffaa00',
  INFO: '#44aaff',
  DEBUG: '#888888',
  TRACE: '#cccccc',
};
