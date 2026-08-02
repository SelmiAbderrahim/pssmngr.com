// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createLocalStorageTransport,
  getStoredLogs,
  clearStoredLogs,
  getStoredLogsSize,
} from '../localStorage';
import type { LogEntry } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'frontend',
    function: 'testFn',
    correlationId: 'corr-abcdefgh',
    message: 'test message',
    context: {},
    metadata: { environment: 'test', version: '1.0.0' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createLocalStorageTransport tests
// ---------------------------------------------------------------------------

describe('createLocalStorageTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    vi.mocked(localStorage.setItem).mockImplementation(() => undefined);
    vi.mocked(localStorage.removeItem).mockImplementation(() => undefined);
    vi.mocked(localStorage.clear).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Transport shape
  // -------------------------------------------------------------------------

  describe('transport shape', () => {
    it('should return an object with name "localStorage"', () => {
      const transport = createLocalStorageTransport();
      expect(transport.name).toBe('localStorage');
    });

    it('should expose a write function', () => {
      const transport = createLocalStorageTransport();
      expect(typeof transport.write).toBe('function');
    });

    it('should expose a flush function', () => {
      const transport = createLocalStorageTransport();
      expect(typeof transport.flush).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // write() – buffering and timer flush
  // -------------------------------------------------------------------------

  describe('write()', () => {
    it('should buffer entries and flush after flushInterval', async () => {
      const transport = createLocalStorageTransport({ flushInterval: 1000 });

      transport.write(makeEntry({ message: 'buffered' }));
      expect(localStorage.setItem).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);

      expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    });

    it('should not flush before the interval elapses', async () => {
      const transport = createLocalStorageTransport({ flushInterval: 5000 });
      transport.write(makeEntry());

      await vi.advanceTimersByTimeAsync(4999);
      expect(localStorage.setItem).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    });

    it('should not schedule a second timer while one is pending', async () => {
      const transport = createLocalStorageTransport({
        flushInterval: 1000,
        maxEntries: 200,
      });

      transport.write(makeEntry({ message: 'first' }));
      transport.write(makeEntry({ message: 'second' }));
      transport.write(makeEntry({ message: 'third' }));

      await vi.advanceTimersByTimeAsync(1000);

      // All three should have been flushed in a single setItem call
      expect(localStorage.setItem).toHaveBeenCalledTimes(1);
      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      );
      expect(stored).toHaveLength(3);
    });

    it('should immediately flush when buffer reaches 50 entries', async () => {
      const transport = createLocalStorageTransport({ flushInterval: 60000 });

      for (let i = 0; i < 50; i++) {
        transport.write(makeEntry({ message: `entry-${i}` }));
      }

      // Immediate flush triggered — no need to advance timers
      expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    });

    it('should not immediately flush with 49 entries', async () => {
      const transport = createLocalStorageTransport({ flushInterval: 60000 });

      for (let i = 0; i < 49; i++) {
        transport.write(makeEntry());
      }

      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('should reset the timer after a timer-triggered flush', async () => {
      const transport = createLocalStorageTransport({ flushInterval: 1000 });

      transport.write(makeEntry({ message: 'first-batch' }));
      await vi.advanceTimersByTimeAsync(1000);
      expect(localStorage.setItem).toHaveBeenCalledTimes(1);

      // Second batch should schedule a new timer
      transport.write(makeEntry({ message: 'second-batch' }));
      await vi.advanceTimersByTimeAsync(1000);
      expect(localStorage.setItem).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // flush() – explicit call
  // -------------------------------------------------------------------------

  describe('flush()', () => {
    it('should do nothing when buffer is empty', () => {
      const transport = createLocalStorageTransport();
      transport.flush!();
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('should persist buffered entries to localStorage', () => {
      const transport = createLocalStorageTransport({
        storageKey: '__test_logs__',
      });

      const entry = makeEntry({ message: 'flush-me' });
      transport.write(entry);
      transport.flush!();

      expect(localStorage.setItem).toHaveBeenCalledWith(
        '__test_logs__',
        expect.any(String)
      );
      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      );
      expect(stored).toHaveLength(1);
      expect(stored[0].message).toBe('flush-me');
    });

    it('should merge with existing entries already in storage', () => {
      const existing = [makeEntry({ message: 'existing' })];
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(existing));

      const transport = createLocalStorageTransport({ storageKey: '__test_logs__' });
      transport.write(makeEntry({ message: 'new' }));
      transport.flush!();

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      );
      expect(stored).toHaveLength(2);
      expect(stored[0].message).toBe('existing');
      expect(stored[1].message).toBe('new');
    });

    it('should clear the buffer after flushing', () => {
      const transport = createLocalStorageTransport({ flushInterval: 60000 });

      transport.write(makeEntry());
      transport.flush!();

      vi.clearAllMocks();

      // Second flush — buffer should be empty
      transport.flush!();
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('should use default storageKey when none provided', () => {
      const transport = createLocalStorageTransport();
      transport.write(makeEntry());
      transport.flush!();

      expect(localStorage.setItem).toHaveBeenCalledWith(
        '__pssmngr_logs__',
        expect.any(String)
      );
    });
  });

  // -------------------------------------------------------------------------
  // Rotation (maxEntries)
  // -------------------------------------------------------------------------

  describe('rotation', () => {
    it('should rotate entries when combined count exceeds maxEntries', () => {
      const existing = Array.from({ length: 5 }, (_, i) =>
        makeEntry({ message: `existing-${i}` })
      );
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(existing));

      const transport = createLocalStorageTransport({
        maxEntries: 6,
        storageKey: '__test_logs__',
      });

      transport.write(makeEntry({ message: 'new-1' }));
      transport.write(makeEntry({ message: 'new-2' }));
      transport.flush!();

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      );
      // 5 existing + 2 new = 7; sliced to last 6
      expect(stored).toHaveLength(6);
      // Oldest entries are dropped — last entry is the newest
      expect(stored[stored.length - 1].message).toBe('new-2');
    });

    it('should not rotate when combined count does not exceed maxEntries', () => {
      const existing = [makeEntry({ message: 'existing' })];
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(existing));

      const transport = createLocalStorageTransport({ maxEntries: 1000 });
      transport.write(makeEntry({ message: 'new' }));
      transport.flush!();

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      );
      expect(stored).toHaveLength(2);
    });

    it('should default maxEntries to 1000', () => {
      const manyEntries = Array.from({ length: 999 }, (_, i) =>
        makeEntry({ message: `entry-${i}` })
      );
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(manyEntries));

      const transport = createLocalStorageTransport();
      transport.write(makeEntry({ message: 'one-more' }));
      transport.flush!();

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      );
      // 999 + 1 = 1000, no rotation needed
      expect(stored).toHaveLength(1000);
    });

    it('should enforce maxEntries with rotation at exactly the threshold', () => {
      const existing = Array.from({ length: 10 }, (_, i) =>
        makeEntry({ message: `old-${i}` })
      );
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(existing));

      const transport = createLocalStorageTransport({ maxEntries: 10 });
      transport.write(makeEntry({ message: 'overflow' }));
      transport.flush!();

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      );
      expect(stored).toHaveLength(10);
      expect(stored[stored.length - 1].message).toBe('overflow');
    });
  });

  // -------------------------------------------------------------------------
  // Error handling in flush()
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('should recover when primary setItem fails with quota error', () => {
      // First setItem fails (primary path), second succeeds (recovery path)
      vi.mocked(localStorage.setItem)
        .mockImplementationOnce(() => { throw new Error('QuotaExceededError'); })
        .mockImplementation(() => undefined);

      const transport = createLocalStorageTransport();
      transport.write(makeEntry({ message: 'quota-test' }));

      expect(() => transport.flush!()).not.toThrow();

      // Recovery: writes buffer only (without existing entries)
      const calls = vi.mocked(localStorage.setItem).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should silently fail when both setItem calls throw', () => {
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const transport = createLocalStorageTransport();
      transport.write(makeEntry());

      expect(() => transport.flush!()).not.toThrow();
    });

    it('should clear buffer even when all setItem calls throw', () => {
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const transport = createLocalStorageTransport({ flushInterval: 60000 });
      transport.write(makeEntry());
      transport.flush!();

      vi.clearAllMocks();
      vi.mocked(localStorage.setItem).mockImplementation(() => undefined);

      // Buffer should be cleared — second flush is a no-op
      transport.flush!();
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON in existing localStorage data (triggers error path)', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('invalid-json{]');
      // setItem behaves normally
      vi.mocked(localStorage.setItem).mockImplementation(() => undefined);

      const transport = createLocalStorageTransport();
      transport.write(makeEntry({ message: 'after-parse-error' }));

      expect(() => transport.flush!()).not.toThrow();
      // Recovery path writes the buffer directly
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should not flush when localStorage is undefined', () => {
      // Save and stub global
      const originalLS = global.localStorage;
      // @ts-expect-error – testing undefined guard
      vi.stubGlobal('localStorage', undefined);

      const transport = createLocalStorageTransport();
      // write still buffers
      transport.write(makeEntry());

      // flush silently skips when localStorage is undefined
      expect(() => transport.flush!()).not.toThrow();

      // Restore
      vi.stubGlobal('localStorage', originalLS);
    });
  });

  // -------------------------------------------------------------------------
  // Custom config
  // -------------------------------------------------------------------------

  describe('custom config', () => {
    it('should use custom storageKey', () => {
      const transport = createLocalStorageTransport({
        storageKey: '__custom_key__',
      });
      transport.write(makeEntry());
      transport.flush!();

      expect(localStorage.setItem).toHaveBeenCalledWith(
        '__custom_key__',
        expect.any(String)
      );
    });

    it('should use custom flushInterval', async () => {
      const transport = createLocalStorageTransport({ flushInterval: 2000 });
      transport.write(makeEntry());

      await vi.advanceTimersByTimeAsync(1999);
      expect(localStorage.setItem).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    });

    it('should use custom maxEntries', () => {
      const existing = Array.from({ length: 3 }, () => makeEntry());
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(existing));

      const transport = createLocalStorageTransport({ maxEntries: 3 });
      transport.write(makeEntry({ message: 'newest' }));
      transport.flush!();

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      );
      expect(stored).toHaveLength(3);
      expect(stored[stored.length - 1].message).toBe('newest');
    });
  });
});

// ---------------------------------------------------------------------------
// getStoredLogs tests
// ---------------------------------------------------------------------------

describe('getStoredLogs', () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no data in storage', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    expect(getStoredLogs()).toEqual([]);
  });

  it('should return parsed entries from storage', () => {
    const entries = [makeEntry({ message: 'stored' })];
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(entries));

    const result = getStoredLogs();
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('stored');
  });

  it('should use the default storage key', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('[]');
    getStoredLogs();
    expect(localStorage.getItem).toHaveBeenCalledWith('__pssmngr_logs__');
  });

  it('should use a custom storage key', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('[]');
    getStoredLogs('__custom_key__');
    expect(localStorage.getItem).toHaveBeenCalledWith('__custom_key__');
  });

  it('should return empty array on JSON parse error', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('invalid-json{]');
    expect(getStoredLogs()).toEqual([]);
  });

  it('should return empty array when localStorage is undefined', () => {
    const original = global.localStorage;
    // @ts-expect-error testing undefined guard
    vi.stubGlobal('localStorage', undefined);

    expect(getStoredLogs()).toEqual([]);

    vi.stubGlobal('localStorage', original);
  });
});

// ---------------------------------------------------------------------------
// clearStoredLogs tests
// ---------------------------------------------------------------------------

describe('clearStoredLogs', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should remove the default storage key', () => {
    clearStoredLogs();
    expect(localStorage.removeItem).toHaveBeenCalledWith('__pssmngr_logs__');
  });

  it('should remove a custom storage key', () => {
    clearStoredLogs('__custom_key__');
    expect(localStorage.removeItem).toHaveBeenCalledWith('__custom_key__');
  });

  it('should not throw when localStorage is undefined', () => {
    const original = global.localStorage;
    // @ts-expect-error testing undefined guard
    vi.stubGlobal('localStorage', undefined);

    expect(() => clearStoredLogs()).not.toThrow();

    vi.stubGlobal('localStorage', original);
  });
});

// ---------------------------------------------------------------------------
// getStoredLogsSize tests
// ---------------------------------------------------------------------------

describe('getStoredLogsSize', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return 0 when no data stored', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    expect(getStoredLogsSize()).toBe(0);
  });

  it('should return the byte size of stored data', () => {
    const data = JSON.stringify([makeEntry({ message: 'size-test' })]);
    vi.mocked(localStorage.getItem).mockReturnValue(data);

    const size = getStoredLogsSize();
    const expectedSize = new Blob([data]).size;
    expect(size).toBe(expectedSize);
  });

  it('should use the default storage key', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    getStoredLogsSize();
    expect(localStorage.getItem).toHaveBeenCalledWith('__pssmngr_logs__');
  });

  it('should use a custom storage key', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    getStoredLogsSize('__custom_key__');
    expect(localStorage.getItem).toHaveBeenCalledWith('__custom_key__');
  });

  it('should return 0 when localStorage is undefined', () => {
    const original = global.localStorage;
    // @ts-expect-error testing undefined guard
    vi.stubGlobal('localStorage', undefined);

    expect(getStoredLogsSize()).toBe(0);

    vi.stubGlobal('localStorage', original);
  });

  it('should return 0 when getItem throws', () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(getStoredLogsSize()).toBe(0);
  });
});
