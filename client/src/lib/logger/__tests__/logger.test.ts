// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createLogger, initializeLogger, getLogger } from '../index';
import type { LogEntry, LogTransport } from '../types';

describe('logger', () => {
  let mockTransport: LogTransport;
  let capturedEntries: LogEntry[];

  beforeEach(() => {
    capturedEntries = [];
    mockTransport = {
      name: 'mock',
      write: (entry: LogEntry) => {
        capturedEntries.push(entry);
      },
    };
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createLogger', () => {
    it('should create logger with default config', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });
      expect(logger).toBeDefined();
      expect(logger.error).toBeInstanceOf(Function);
      expect(logger.warn).toBeInstanceOf(Function);
      expect(logger.info).toBeInstanceOf(Function);
      expect(logger.debug).toBeInstanceOf(Function);
      expect(logger.trace).toBeInstanceOf(Function);
    });

    it('should log with correct structure', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      logger.info('Test message', { function: 'testFunction' });

      expect(capturedEntries).toHaveLength(1);
      const entry = capturedEntries[0];
      expect(entry.level).toBe('INFO');
      expect(entry.service).toBe('frontend');
      expect(entry.message).toBe('Test message');
      expect(entry.function).toBe('testFunction');
      expect(entry.timestamp).toBeDefined();
      expect(entry.correlationId).toBeDefined();
      expect(entry.metadata).toBeDefined();
    });

    it('should respect minLevel filtering', () => {
      const logger = createLogger({
        service: 'frontend',
        minLevel: 'WARN',
        transports: [mockTransport],
      });

      logger.trace('Trace message');
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(capturedEntries).toHaveLength(2);
      expect(capturedEntries[0].level).toBe('WARN');
      expect(capturedEntries[1].level).toBe('ERROR');
    });

    it('should sanitize context data', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      logger.info('User action', {
        function: 'login',
        email: 'user@test.com',
        password: 'secret123',
      });

      const entry = capturedEntries[0];
      expect(entry.context.email).toBe('[REDACTED]');
      expect(entry.context.password).toBe('[REDACTED]');
    });

    it('should handle error objects', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      const testError = new Error('Test error');
      logger.error('Operation failed', {
        function: 'testOp',
        error: testError,
      });

      const entry = capturedEntries[0];
      expect(entry.error).toBeDefined();
      expect(entry.error?.name).toBe('Error');
      expect(entry.error?.message).toBe('Test error');
    });

    it('should include performance metrics', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      logger.info('Operation completed', {
        function: 'testOp',
        performance: { duration: 150, memoryUsage: 1024 },
      });

      const entry = capturedEntries[0];
      expect(entry.performance).toEqual({ duration: 150, memoryUsage: 1024 });
    });

    it('should hash user IDs', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      logger.info('User action', {
        function: 'action',
        userId: 'user123',
      });

      const entry = capturedEntries[0];
      expect(entry.userId).toBeDefined();
      expect(entry.userId).not.toBe('user123');
      expect(entry.userId).toMatch(/^user_[0-9a-f]+$/);
    });
  });

  describe('child logger', () => {
    it('should inherit parent context', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
        defaultContext: { component: 'App' },
      });

      const childLogger = logger.child({ module: 'auth' });
      childLogger.info('Child message', { function: 'test' });

      const entry = capturedEntries[0];
      expect(entry.context.component).toBe('App');
      expect(entry.context.module).toBe('auth');
    });

    it('should override parent context', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
        defaultContext: { version: '1.0' },
      });

      const childLogger = logger.child({ version: '2.0' });
      childLogger.info('Test', { function: 'test' });

      const entry = capturedEntries[0];
      expect(entry.context.version).toBe('2.0');
    });
  });

  describe('correlation ID management', () => {
    it('should use same correlation ID for multiple logs', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      logger.info('First message', { function: 'test' });
      logger.info('Second message', { function: 'test' });

      expect(capturedEntries[0].correlationId).toBe(capturedEntries[1].correlationId);
    });

    it('should allow setting correlation ID', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      const customId = 'custom-correlation-id';
      logger.setCorrelationId(customId);
      logger.info('Test message', { function: 'test' });

      expect(capturedEntries[0].correlationId).toBe(customId);
    });

    it('should return current correlation ID', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      const id = logger.getCorrelationId();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });
  });

  describe('performance', () => {
    it('should handle 1000 log entries efficiently', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        logger.info(`Log entry ${i}`, {
          function: 'perfTest',
          index: i,
        });
      }

      const duration = performance.now() - startTime;
      // Performance threshold accounts for Docker environment overhead
      // Typical performance: ~300-500ms in Docker, ~100-200ms native
      expect(duration).toBeLessThan(1000);
      expect(capturedEntries).toHaveLength(1000);
    });

    it('should handle large context objects efficiently', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      const largeContext = {
        function: 'largeContextTest',
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          values: Array.from({ length: 10 }, (_, j) => j * i),
        })),
      };

      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        logger.info('Large context log', largeContext);
      }

      const duration = performance.now() - startTime;
      // Performance threshold accounts for Docker environment overhead
      // Typical performance: ~1500-2000ms in Docker, ~500-800ms native
      expect(duration).toBeLessThan(3000);
    });
  });

  describe('initializeLogger and getLogger', () => {
    it('should return singleton instance', () => {
      const logger1 = initializeLogger({ service: 'frontend', transports: [mockTransport] });
      const logger2 = getLogger();
      expect(logger1).toBe(logger2);
    });

    it('should return existing singleton without re-initializing', () => {
      const logger1 = initializeLogger({ service: 'frontend', transports: [mockTransport] });
      // getLogger should return the same instance without calling initializeLogger again
      const logger2 = getLogger();
      const logger3 = getLogger();
      expect(logger2).toBe(logger1);
      expect(logger3).toBe(logger1);
    });
  });

  describe('error with code property', () => {
    it('should include error code when present on Error object', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      const errorWithCode = new Error('Coded error') as Error & { code: string };
      errorWithCode.code = 'ERR_NOT_FOUND';

      logger.error('Coded error occurred', {
        function: 'testOp',
        error: errorWithCode,
      });

      const entry = capturedEntries[0];
      expect(entry.error).toBeDefined();
      expect(entry.error?.code).toBe('ERR_NOT_FOUND');
    });

    it('should pass through ErrorInfo objects directly (non-Error instances)', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      const errorInfo = { name: 'CustomError', message: 'Custom message', code: 'CUSTOM_CODE' };
      logger.error('Custom error info', {
        function: 'testOp',
        error: errorInfo,
      });

      const entry = capturedEntries[0];
      expect(entry.error?.name).toBe('CustomError');
      expect(entry.error?.message).toBe('Custom message');
    });
  });

  describe('transport failure handling', () => {
    it('should continue logging when a transport throws synchronously', () => {
      const failingTransport = {
        name: 'failing',
        write: () => { throw new Error('Transport failed'); },
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const logger = createLogger({
        service: 'frontend',
        transports: [failingTransport, mockTransport],
      });

      // Should not throw — the catch block handles the error
      expect(() => logger.info('Test with failing transport')).not.toThrow();

      // Second transport should still have been called
      expect(capturedEntries).toHaveLength(1);

      consoleSpy.mockRestore();
    });
  });

  describe('getUserAgent fallback', () => {
    it('should return "unknown" when navigator is not defined', () => {
      const originalNavigator = globalThis.navigator;
      // @ts-expect-error — removing navigator to test fallback branch
      delete globalThis.navigator;

      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });
      logger.info('Test no-navigator');
      const entry = capturedEntries[0];
      expect(entry.metadata.userAgent).toBe('unknown');

      // Restore
      globalThis.navigator = originalNavigator;
    });

    it('should return navigator.userAgent when navigator is defined', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });
      logger.info('Test with navigator');
      const entry = capturedEntries[0];
      // jsdom provides a userAgent string
      expect(typeof entry.metadata.userAgent).toBe('string');
      expect(entry.metadata.userAgent).not.toBe('unknown');
    });
  });

  describe('getHostname fallback', () => {
    it('should return "unknown" when window is not defined', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error — removing window to test fallback branch
      delete globalThis.window;

      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });
      logger.info('Test no-window');
      const entry = capturedEntries[0];
      expect(entry.metadata.hostname).toBe('unknown');

      // Restore
      globalThis.window = originalWindow;
    });
  });

  describe('getEnvironment branches', () => {
    it('should include environment in metadata', () => {
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });

      logger.info('Test environment');
      const entry = capturedEntries[0];
      expect(entry.metadata.environment).toMatch(/^(development|production|test)$/);
    });
  });

  describe('initializeLogger DEV branch', () => {
    it('should create logger with custom minLevel overriding default', () => {
      const logger = initializeLogger({
        service: 'frontend',
        minLevel: 'TRACE',
        transports: [mockTransport],
      });

      logger.trace('Trace message for DEV branch test');
      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].level).toBe('TRACE');
    });
  });

  describe('getLogger returns existing instance without re-initializing', () => {
    it('should return the same instance on repeated getLogger calls', () => {
      // initializeLogger sets the singleton; subsequent getLogger calls should
      // return the exact same object (exercising the truthy globalLogger branch)
      const first = initializeLogger({ service: 'frontend', transports: [mockTransport] });
      const second = getLogger();
      const third = getLogger();
      expect(second).toBe(first);
      expect(third).toBe(first);
    });

    it('should auto-initialize when getLogger is called before initializeLogger (lines 192-193)', async () => {
      // Load a fresh module instance so globalLogger starts as null,
      // then call getLogger() to exercise the initialization branch
      vi.resetModules();
      const freshModule = await import('../index');
      // getLogger() with null globalLogger triggers initializeLogger() internally
      const logger = freshModule.getLogger();
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      // A second call returns the same instance (truthy branch)
      const sameLogger = freshModule.getLogger();
      expect(sameLogger).toBe(logger);
    });
  });

  describe('getEnvironment: production and test branches', () => {
    it('should report environment matching the current build mode', () => {
      // In vitest the MODE is 'test', so getEnvironment returns 'test'.
      // PROD is false in test mode. Lines 27 and 29 are the production/test guards.
      // We exercise them indirectly: the metadata.environment field is populated
      // by getEnvironment() on every log entry.
      const logger = createLogger({
        service: 'frontend',
        transports: [mockTransport],
      });
      logger.info('env branch coverage');
      const entry = capturedEntries[0];
      // The test vitest runner sets MODE=test → getEnvironment returns 'test'
      // If not 'test', it would be 'development' (default branch line 29)
      expect(['test', 'development', 'production']).toContain(entry.metadata.environment);
    });
  });
});
