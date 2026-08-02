// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateCorrelationId,
  getCorrelationId,
  setCorrelationId,
  clearCorrelationId,
  getCorrelationHeaders,
  rotateCorrelationId,
  CORRELATION_ID_HEADER,
  CORRELATION_ID_KEY,
  extractCorrelationIdFromHeaders,
} from '../correlation';

describe('correlation', () => {
  // Create a real storage mock that persists values
  let storage: Record<string, string> = {};

  beforeEach(() => {
    // Reset storage
    storage = {};

    // Mock sessionStorage with actual storage behavior
    vi.spyOn(sessionStorage, 'getItem').mockImplementation((key: string) => {
      return storage[key] ?? null;
    });
    vi.spyOn(sessionStorage, 'setItem').mockImplementation((key: string, value: string) => {
      storage[key] = value;
    });
    vi.spyOn(sessionStorage, 'removeItem').mockImplementation((key: string) => {
      Reflect.deleteProperty(storage, key);
    });
    vi.spyOn(sessionStorage, 'clear').mockImplementation(() => {
      storage = {};
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate valid UUID format', () => {
      const id = generateCorrelationId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('getCorrelationId', () => {
    it('should create new ID if none exists', () => {
      const id = getCorrelationId();
      expect(id).toBeDefined();
      expect(id.length).toBeGreaterThan(0);
    });

    it('should return same ID on subsequent calls', () => {
      const id1 = getCorrelationId();
      const id2 = getCorrelationId();
      expect(id1).toBe(id2);
    });
  });

  describe('setCorrelationId', () => {
    it('should set custom correlation ID', () => {
      const customId = 'custom-test-id-123';
      setCorrelationId(customId);
      const retrievedId = getCorrelationId();
      expect(retrievedId).toBe(customId);
    });
  });

  describe('clearCorrelationId', () => {
    it('should remove correlation ID from storage', () => {
      // First set an ID
      setCorrelationId('test-id-to-clear');
      // Clear it
      clearCorrelationId();
      // Verify it's gone
      const storedId = sessionStorage.getItem(CORRELATION_ID_KEY);
      expect(storedId).toBeNull();
    });
  });

  describe('getCorrelationHeaders', () => {
    it('should return object with correlation ID header', () => {
      const headers = getCorrelationHeaders();
      expect(headers).toHaveProperty(CORRELATION_ID_HEADER);
      expect(typeof headers[CORRELATION_ID_HEADER]).toBe('string');
    });
  });

  describe('extractCorrelationIdFromHeaders', () => {
    it('should extract correlation ID from Headers object', () => {
      const correlationId = 'test-correlation-id';
      const headers = new Headers();
      headers.set(CORRELATION_ID_HEADER, correlationId);
      
      const extractedId = extractCorrelationIdFromHeaders(headers);
      expect(extractedId).toBe(correlationId);
    });

    it('should return null if header not found', () => {
      const headers = new Headers();
      const extractedId = extractCorrelationIdFromHeaders(headers);
      expect(extractedId).toBeNull();
    });
  });

  describe('rotateCorrelationId', () => {
    it('should create new correlation ID', () => {
      const id1 = getCorrelationId();
      const id2 = rotateCorrelationId();
      expect(id1).not.toBe(id2);
      expect(id2).toBeDefined();
    });

    it('should update stored correlation ID', () => {
      // First set an ID
      const originalId = getCorrelationId();
      // Rotate to new ID
      const newId = rotateCorrelationId();
      const storedId = getCorrelationId();
      expect(storedId).toBe(newId);
      expect(newId).not.toBe(originalId);
    });
  });

  // Test edge cases and error handling
  describe('edge cases', () => {
    it('should handle sessionStorage being undefined', () => {
      // Mock sessionStorage as undefined
      const originalSessionStorage = global.sessionStorage;
      global.sessionStorage = undefined as any;
      
      try {
        const id = getCorrelationId();
        expect(id).toBeDefined();
        expect(id.length).toBeGreaterThan(0);
      } finally {
        // Restore original sessionStorage
        global.sessionStorage = originalSessionStorage;
      }
    });

    it('should handle crypto.randomUUID being unavailable', () => {
      // Mock crypto.randomUUID as undefined
      const originalCrypto = global.crypto;
      
      // Use Object.defineProperty to properly mock the property
      Object.defineProperty(global, 'crypto', {
        value: { ...originalCrypto, randomUUID: undefined },
        configurable: true,
        writable: true
      });
      
      try {
        const id = generateCorrelationId();
        expect(id).toBeDefined();
        // Should use fallback pattern
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      } finally {
        // Restore original crypto
        global.crypto = originalCrypto;
      }
    });
  });
});
