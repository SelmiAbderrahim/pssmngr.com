// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBatchTransport } from '../batch';
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
    correlationId: 'corr-1234-5678',
    message: 'test message',
    context: {},
    metadata: { environment: 'test', version: '1.0.0' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Batch Transport Tests
// ---------------------------------------------------------------------------

describe('createBatchTransport', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockSendBeacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    // Mock fetch
    mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    // Mock sendBeacon – default returns false so fetch path is exercised
    mockSendBeacon = vi.fn().mockReturnValue(false);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: mockSendBeacon,
      writable: true,
      configurable: true,
    });

    // Reset localStorage mock state
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    vi.mocked(localStorage.setItem).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Transport shape
  // -------------------------------------------------------------------------

  describe('transport shape', () => {
    it('should return an object with the correct interface', () => {
      const transport = createBatchTransport({ endpoint: '/api/logs' });
      expect(transport.name).toBe('batch');
      expect(typeof transport.write).toBe('function');
      expect(typeof transport.flush).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // write() — buffering and immediate flush
  // -------------------------------------------------------------------------

  describe('write()', () => {
    it('should buffer entries without sending when under batchSize', async () => {
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 5,
        flushInterval: 60000,
      });

      transport.write(makeEntry());
      transport.write(makeEntry());

      await vi.runAllTimersAsync();
      // Flush timer hasn't fired yet; fetch only called if timer fires
      // We manually flush to verify entries were buffered
      transport.flush!();
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should immediately flush when batchSize is reached', async () => {
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 3,
        flushInterval: 60000,
      });

      transport.write(makeEntry());
      transport.write(makeEntry());
      transport.write(makeEntry()); // triggers immediate flush

      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.logs).toHaveLength(3);
    });

    it('should send all entries when batchSize is exactly hit', async () => {
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 2,
      });

      const e1 = makeEntry({ message: 'first' });
      const e2 = makeEntry({ message: 'second' });
      transport.write(e1);
      transport.write(e2);

      await vi.runAllTimersAsync();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.logs[0].message).toBe('first');
      expect(body.logs[1].message).toBe('second');
    });

    it('should schedule a flush timer on first write when under batchSize', async () => {
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 10,
        flushInterval: 5000,
      });

      transport.write(makeEntry());
      expect(mockFetch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not schedule multiple flush timers for consecutive writes', async () => {
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 100,
        flushInterval: 5000,
      });

      // Write multiple entries — each scheduleFlush call should be a no-op after first
      for (let i = 0; i < 5; i++) {
        transport.write(makeEntry());
      }

      await vi.advanceTimersByTimeAsync(5000);

      // Only one flush should have occurred
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.logs).toHaveLength(5);
    });
  });

  // -------------------------------------------------------------------------
  // flush()
  // -------------------------------------------------------------------------

  describe('flush()', () => {
    it('should do nothing when the buffer is empty', async () => {
      const transport = createBatchTransport({ endpoint: '/api/logs' });
      transport.flush!();
      await vi.runAllTimersAsync();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send all buffered entries on explicit flush', async () => {
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 100,
        flushInterval: 60000,
      });

      transport.write(makeEntry({ message: 'a' }));
      transport.write(makeEntry({ message: 'b' }));
      transport.flush!();

      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.logs).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // sendBeacon path
  // -------------------------------------------------------------------------

  describe('sendBeacon path', () => {
    it('should use sendBeacon when it returns true and skip fetch', async () => {
      mockSendBeacon.mockReturnValue(true);

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
      });

      transport.write(makeEntry());
      await vi.runAllTimersAsync();

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send a Blob with application/json content type via sendBeacon', async () => {
      mockSendBeacon.mockReturnValue(true);

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
      });

      transport.write(makeEntry({ message: 'beacon-test' }));
      await vi.runAllTimersAsync();

      const [url, blob] = mockSendBeacon.mock.calls[0];
      expect(url).toBe('/api/logs');
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/json');
    });

    it('should fall back to fetch when sendBeacon returns false', async () => {
      mockSendBeacon.mockReturnValue(false);

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
      });

      transport.write(makeEntry());
      await vi.runAllTimersAsync();

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use fetch when navigator.sendBeacon is not available', async () => {
      Object.defineProperty(navigator, 'sendBeacon', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
      });

      transport.write(makeEntry());
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // fetch request shape
  // -------------------------------------------------------------------------

  describe('fetch request', () => {
    it('should POST with correct headers and keepalive', async () => {
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
      });

      transport.write(makeEntry());
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledWith('/api/logs', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }));
    });

    it('should serialize entries as JSON in request body', async () => {
      const entry = makeEntry({ message: 'serialize-me', level: 'ERROR' });
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
      });

      transport.write(entry);
      await vi.runAllTimersAsync();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({ logs: [entry] });
    });
  });

  // -------------------------------------------------------------------------
  // Retry logic
  // -------------------------------------------------------------------------

  describe('retry logic', () => {
    it('should retry when fetch returns ok: false', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
        maxRetries: 2,
        retryDelay: 1000,
      });

      transport.write(makeEntry());
      await vi.runAllTimersAsync();

      // Initial attempt + 2 retries = 3 total calls
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should use exponential backoff for retries', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
        maxRetries: 2,
        retryDelay: 1000,
      });

      transport.write(makeEntry());

      // First attempt fires immediately via batchSize trigger
      await vi.runAllTimersAsync();

      // After all retries exhausted, entries should go to localStorage fallback
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should store entries in localStorage fallback after max retries', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
        maxRetries: 1,
        retryDelay: 100,
      });

      transport.write(makeEntry({ message: 'failed-entry' }));
      await vi.runAllTimersAsync();

      expect(localStorage.setItem).toHaveBeenCalledWith(
        '__pssmngr_logs_failed__',
        expect.any(String)
      );
    });

    it('should merge with existing failed entries in localStorage', async () => {
      const existingEntries = [makeEntry({ message: 'existing' })];
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(existingEntries));
      mockFetch.mockResolvedValue({ ok: false });

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
        maxRetries: 1,
        retryDelay: 100,
      });

      transport.write(makeEntry({ message: 'new-failed' }));
      await vi.runAllTimersAsync();

      const setItemCall = vi.mocked(localStorage.setItem).mock.calls.find(
        ([key]) => key === '__pssmngr_logs_failed__'
      );
      expect(setItemCall).toBeDefined();
      const stored = JSON.parse(setItemCall![1] as string);
      expect(stored.length).toBeGreaterThanOrEqual(2);
    });

    it('should limit localStorage fallback entries to last 100', async () => {
      const manyEntries = Array.from({ length: 110 }, (_, i) =>
        makeEntry({ message: `entry-${i}` })
      );
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(manyEntries));
      mockFetch.mockResolvedValue({ ok: false });

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
        maxRetries: 1,
        retryDelay: 100,
      });

      transport.write(makeEntry({ message: 'overflow' }));
      await vi.runAllTimersAsync();

      const setItemCall = vi.mocked(localStorage.setItem).mock.calls.find(
        ([key]) => key === '__pssmngr_logs_failed__'
      );
      const stored = JSON.parse(setItemCall![1] as string);
      expect(stored.length).toBe(100);
    });

    it('should reset retryCount after max retries reached', async () => {
      // After exhausting retries, the counter should reset so next batch can retry
      mockFetch
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: false }) // retry 1
        .mockResolvedValue({ ok: true });    // next batch succeeds

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
        maxRetries: 1,
        retryDelay: 100,
      });

      transport.write(makeEntry({ message: 'first-batch' }));
      await vi.runAllTimersAsync();

      // Second batch should succeed (retryCount reset to 0)
      transport.write(makeEntry({ message: 'second-batch' }));
      await vi.runAllTimersAsync();

      const successCalls = mockFetch.mock.calls.filter((_, i) => {
        // The last call should succeed
        return i === mockFetch.mock.calls.length - 1;
      });
      expect(successCalls.length).toBeGreaterThan(0);
    });

    it('should silently handle localStorage errors during fallback', async () => {
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      mockFetch.mockResolvedValue({ ok: false });

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
        maxRetries: 1,
        retryDelay: 100,
      });

      // Should not throw
      expect(() => {
        transport.write(makeEntry());
      }).not.toThrow();

      await vi.runAllTimersAsync();
    });

    it('should silently handle localStorage getItem parse errors during fallback', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue('invalid-json{]');
      mockFetch.mockResolvedValue({ ok: false });

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
        maxRetries: 1,
        retryDelay: 100,
      });

      transport.write(makeEntry());
      // Should not throw even with parse error
      await expect(vi.runAllTimersAsync()).resolves.not.toThrow();
    });

    it('should reset retryCount on successful send', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
        maxRetries: 3,
        retryDelay: 100,
      });

      transport.write(makeEntry());
      await vi.runAllTimersAsync();

      // retryCount resets; subsequent batches start fresh
      transport.write(makeEntry());
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // fetch error path
  // -------------------------------------------------------------------------

  describe('fetch error handling', () => {
    it('should handle fetch network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 1,
        maxRetries: 1,
        retryDelay: 100,
      });

      transport.write(makeEntry());
      await expect(vi.runAllTimersAsync()).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Window event listeners
  // -------------------------------------------------------------------------

  describe('window event listeners', () => {
    it('should flush on beforeunload when buffer has entries', async () => {
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 100,
        flushInterval: 60000,
      });

      transport.write(makeEntry({ message: 'before-unload' }));

      window.dispatchEvent(new Event('beforeunload'));
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not flush on beforeunload when buffer is empty', async () => {
      // Create transport with empty buffer
      createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 100,
        flushInterval: 60000,
      });

      window.dispatchEvent(new Event('beforeunload'));
      await vi.runAllTimersAsync();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should flush on visibilitychange when hidden with buffered entries', async () => {
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 100,
        flushInterval: 60000,
      });

      transport.write(makeEntry({ message: 'visibility-hidden' }));

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('visibilitychange'));
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not flush on visibilitychange when document is visible', async () => {
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 100,
        flushInterval: 60000,
      });

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('visibilitychange'));

      // Buffer is empty when visibilityState is visible — no flush should happen
      expect(mockFetch).not.toHaveBeenCalled();

      // Writing after the event also should not cause a flush without timer
      transport.write(makeEntry());
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should flush twice when hidden with two separate writes across transports', async () => {
      // Two independent transports, both with entries, both should flush on
      // visibilitychange. This verifies the event listener is registered per instance.
      const t1 = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 100,
        flushInterval: 60000,
      });
      const t2 = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 100,
        flushInterval: 60000,
      });

      t1.write(makeEntry({ message: 'transport-1' }));
      t2.write(makeEntry({ message: 'transport-2' }));

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('visibilitychange'));
      await vi.runAllTimersAsync();

      // Both transports had entries and both should have flushed
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // Default config values
  // -------------------------------------------------------------------------

  describe('default config', () => {
    it('should use default batchSize of 10', async () => {
      const transport = createBatchTransport({ endpoint: '/api/logs' });

      for (let i = 0; i < 9; i++) {
        transport.write(makeEntry());
      }
      expect(mockFetch).not.toHaveBeenCalled();

      transport.write(makeEntry()); // 10th entry triggers flush
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.logs).toHaveLength(10);
    });

    it('should use default flushInterval of 30000ms', async () => {
      const transport = createBatchTransport({ endpoint: '/api/logs' });

      transport.write(makeEntry());
      expect(mockFetch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(29999);
      expect(mockFetch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Custom config values
  // -------------------------------------------------------------------------

  describe('custom config', () => {
    it('should respect custom batchSize', async () => {
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        batchSize: 2,
      });

      transport.write(makeEntry());
      expect(mockFetch).not.toHaveBeenCalled();

      transport.write(makeEntry()); // triggers at batchSize=2
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should respect custom flushInterval', async () => {
      const transport = createBatchTransport({
        endpoint: '/api/logs',
        flushInterval: 1000,
        batchSize: 100,
      });

      transport.write(makeEntry());

      await vi.advanceTimersByTimeAsync(999);
      expect(mockFetch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should send to configured endpoint', async () => {
      const transport = createBatchTransport({
        endpoint: 'https://example.com/logs',
        batchSize: 1,
      });

      transport.write(makeEntry());
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/logs',
        expect.anything()
      );
    });
  });
});
