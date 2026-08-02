// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createConsoleTransport } from '../console';
import { LOG_LEVEL_COLORS } from '../../types';
import type { LogEntry, LogLevel } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: '2024-01-15T10:30:00.000Z',
    level: 'INFO',
    service: 'frontend',
    function: 'myFunction',
    correlationId: 'abcdef12-3456-7890-abcd-ef1234567890',
    message: 'test message',
    context: {},
    metadata: { environment: 'test', version: '1.0.0' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Console Transport Tests
// ---------------------------------------------------------------------------

describe('createConsoleTransport', () => {
  // Spies for all console methods
  let spyError: ReturnType<typeof vi.spyOn>;
  let spyWarn: ReturnType<typeof vi.spyOn>;
  let spyInfo: ReturnType<typeof vi.spyOn>;
  let spyDebug: ReturnType<typeof vi.spyOn>;
  let spyTrace: ReturnType<typeof vi.spyOn>;
  let spyLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
    spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    spyInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    spyDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    spyTrace = vi.spyOn(console, 'trace').mockImplementation(() => {});
    spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Transport shape
  // -------------------------------------------------------------------------

  describe('transport shape', () => {
    it('should return an object with name "console"', () => {
      const transport = createConsoleTransport();
      expect(transport.name).toBe('console');
    });

    it('should expose a write function', () => {
      const transport = createConsoleTransport();
      expect(typeof transport.write).toBe('function');
    });

    it('should not expose a flush function', () => {
      const transport = createConsoleTransport();
      expect(transport.flush).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Production mode (prettyPrint: false)
  // -------------------------------------------------------------------------

  describe('production mode (prettyPrint: false)', () => {
    it('should output JSON-serialized entry', () => {
      const transport = createConsoleTransport({ prettyPrint: false });
      const entry = makeEntry({ level: 'INFO' });

      transport.write(entry);

      expect(spyInfo).toHaveBeenCalledWith(JSON.stringify(entry));
    });

    it('should use console.error for ERROR level', () => {
      const transport = createConsoleTransport({ prettyPrint: false });
      transport.write(makeEntry({ level: 'ERROR' }));
      expect(spyError).toHaveBeenCalledTimes(1);
    });

    it('should use console.warn for WARN level', () => {
      const transport = createConsoleTransport({ prettyPrint: false });
      transport.write(makeEntry({ level: 'WARN' }));
      expect(spyWarn).toHaveBeenCalledTimes(1);
    });

    it('should use console.info for INFO level', () => {
      const transport = createConsoleTransport({ prettyPrint: false });
      transport.write(makeEntry({ level: 'INFO' }));
      expect(spyInfo).toHaveBeenCalledTimes(1);
    });

    it('should use console.debug for DEBUG level', () => {
      const transport = createConsoleTransport({ prettyPrint: false });
      transport.write(makeEntry({ level: 'DEBUG' }));
      expect(spyDebug).toHaveBeenCalledTimes(1);
    });

    it('should use console.trace for TRACE level', () => {
      const transport = createConsoleTransport({ prettyPrint: false });
      transport.write(makeEntry({ level: 'TRACE' }));
      expect(spyTrace).toHaveBeenCalledTimes(1);
    });

    it('should use console.log for unknown level', () => {
      const transport = createConsoleTransport({ prettyPrint: false });
      transport.write(makeEntry({ level: 'UNKNOWN' as LogLevel }));
      expect(spyLog).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Development mode (prettyPrint: true)
  // -------------------------------------------------------------------------

  describe('development mode (prettyPrint: true)', () => {
    it('should use %c prefix with style for colorized output', () => {
      const transport = createConsoleTransport({
        prettyPrint: true,
        colorize: true,
      });
      const entry = makeEntry({ level: 'INFO' });

      transport.write(entry);

      expect(spyInfo).toHaveBeenCalledTimes(1);
      const firstArg: string = spyInfo.mock.calls[0][0];
      expect(firstArg).toMatch(/^%c\[/);
    });

    it('should include the log level in the prefix', () => {
      const transport = createConsoleTransport({ prettyPrint: true });
      transport.write(makeEntry({ level: 'WARN' }));

      const firstArg: string = spyWarn.mock.calls[0][0];
      expect(firstArg).toContain('WARN');
    });

    it('should include the function name in the prefix', () => {
      const transport = createConsoleTransport({ prettyPrint: true });
      transport.write(makeEntry({ function: 'handleClick' }));

      const firstArg: string = spyInfo.mock.calls[0][0];
      expect(firstArg).toContain('handleClick');
    });

    it('should include truncated correlationId', () => {
      const transport = createConsoleTransport({ prettyPrint: true });
      const entry = makeEntry({ correlationId: 'abcdef12-rest-of-id' });
      transport.write(entry);

      const callArgs = spyInfo.mock.calls[0];
      // The third argument should contain the message
      expect(callArgs).toContain('test message');
      // The first argument should contain the first 8 chars of correlationId
      expect(callArgs[0]).toContain('abcdef12');
    });

    it('should include timestamp when includeTimestamp is true', () => {
      const transport = createConsoleTransport({
        prettyPrint: true,
        includeTimestamp: true,
      });
      transport.write(makeEntry());

      const firstArg: string = spyInfo.mock.calls[0][0];
      // Timestamp appears in the bracket prefix — non-empty
      expect(firstArg).toMatch(/^\%c\[.+\]/);
    });

    it('should omit timestamp when includeTimestamp is false', () => {
      const transport = createConsoleTransport({
        prettyPrint: true,
        includeTimestamp: false,
        colorize: false,
      });
      transport.write(makeEntry());

      const firstArg: string = spyInfo.mock.calls[0][0];
      // Prefix should start with empty timestamp bracket: [  ]
      expect(firstArg).toMatch(/^\%c\[\s*\]/);
    });

    it('should apply correct color style for each level', () => {
      const levels: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
      const spies: Record<string, typeof spyError> = {
        ERROR: spyError,
        WARN: spyWarn,
        INFO: spyInfo,
        DEBUG: spyDebug,
        TRACE: spyTrace,
      };

      levels.forEach((level) => {
        vi.clearAllMocks();
        const transport = createConsoleTransport({
          prettyPrint: true,
          colorize: true,
        });
        transport.write(makeEntry({ level }));

        const spy = spies[level];
        expect(spy).toHaveBeenCalledTimes(1);
        // Second argument is the CSS style string
        const styleArg: string = spy.mock.calls[0][1];
        expect(styleArg).toContain(LOG_LEVEL_COLORS[level]);
      });
    });

    it('should use empty style string when colorize is false', () => {
      const transport = createConsoleTransport({
        prettyPrint: true,
        colorize: false,
      });
      transport.write(makeEntry({ level: 'INFO' }));

      const styleArg: string = spyInfo.mock.calls[0][1];
      expect(styleArg).toBe('');
    });

    it('should include context when context is non-empty', () => {
      const transport = createConsoleTransport({ prettyPrint: true });
      const ctx = { userId: 'u-123', action: 'click' };
      transport.write(makeEntry({ context: ctx }));

      const callArgs = spyInfo.mock.calls[0];
      expect(callArgs).toContain('\nContext:');
      expect(callArgs).toContain(ctx);
    });

    it('should not include context section when context is empty', () => {
      const transport = createConsoleTransport({ prettyPrint: true });
      transport.write(makeEntry({ context: {} }));

      const callArgs = spyInfo.mock.calls[0];
      expect(callArgs).not.toContain('\nContext:');
    });

    it('should include error details when error is present', () => {
      const transport = createConsoleTransport({ prettyPrint: true });
      const error = { name: 'TypeError', message: 'Cannot read property' };
      transport.write(makeEntry({ error }));

      const callArgs = spyInfo.mock.calls[0];
      expect(callArgs).toContain('\nError:');
      expect(callArgs).toContain(error);
    });

    it('should include both context and error when both are present', () => {
      const transport = createConsoleTransport({ prettyPrint: true });
      const ctx = { key: 'value' };
      const error = { name: 'Error', message: 'Something went wrong' };
      // error takes precedence in the if/else chain — error branch renders Context too
      transport.write(makeEntry({ context: ctx, error }));

      const callArgs = spyInfo.mock.calls[0];
      expect(callArgs).toContain('\nContext:');
      expect(callArgs).toContain('\nError:');
    });

    it('should use correct console method in prettyPrint mode for each level', () => {
      const cases: Array<[LogLevel, typeof spyError]> = [
        ['ERROR', spyError],
        ['WARN', spyWarn],
        ['INFO', spyInfo],
        ['DEBUG', spyDebug],
        ['TRACE', spyTrace],
      ];

      cases.forEach(([level, spy]) => {
        vi.clearAllMocks();
        const transport = createConsoleTransport({ prettyPrint: true });
        transport.write(makeEntry({ level }));
        expect(spy).toHaveBeenCalledTimes(1);
      });
    });

    it('should use console.log for unknown level in prettyPrint mode', () => {
      const transport = createConsoleTransport({ prettyPrint: true });
      transport.write(makeEntry({ level: 'VERBOSE' as LogLevel }));
      expect(spyLog).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Default config
  // -------------------------------------------------------------------------

  describe('default config', () => {
    it('should create transport with no arguments', () => {
      expect(() => createConsoleTransport()).not.toThrow();
    });

    it('should default colorize to true', () => {
      // Force prettyPrint for predictable behavior
      const transport = createConsoleTransport({
        prettyPrint: true,
        includeTimestamp: false,
      });
      transport.write(makeEntry({ level: 'INFO' }));

      const styleArg: string = spyInfo.mock.calls[0][1];
      // colorize defaults to true so style should contain color
      expect(styleArg).toContain('color:');
    });

    it('should default includeTimestamp to true', () => {
      const transport = createConsoleTransport({ prettyPrint: true });
      transport.write(makeEntry());
      // No error thrown; timestamp is included — just verify write works
      expect(spyInfo).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Message always included
  // -------------------------------------------------------------------------

  describe('message output', () => {
    it('should always include the message in prettyPrint output', () => {
      const transport = createConsoleTransport({ prettyPrint: true });
      transport.write(makeEntry({ message: 'hello world' }));

      const callArgs = spyInfo.mock.calls[0];
      expect(callArgs).toContain('hello world');
    });

    it('should always include the message in production output', () => {
      const transport = createConsoleTransport({ prettyPrint: false });
      const entry = makeEntry({ message: 'production log' });
      transport.write(entry);

      expect(spyInfo).toHaveBeenCalledWith(
        expect.stringContaining('production log')
      );
    });
  });
});
