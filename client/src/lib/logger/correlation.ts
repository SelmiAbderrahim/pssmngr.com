// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Correlation ID management for request tracing
 * Enables full request traceability across frontend → backend → external APIs
 */

const CORRELATION_ID_KEY = '__pssmngr_correlation_id__';
const CORRELATION_ID_HEADER = 'X-Correlation-ID';

/**
 * Generates a UUID v4 correlation ID
 */
export function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Gets the current correlation ID from session storage
 * Creates a new one if not exists
 */
export function getCorrelationId(): string {
  if (typeof sessionStorage === 'undefined') {
    return generateCorrelationId();
  }

  let correlationId = sessionStorage.getItem(CORRELATION_ID_KEY);

  if (!correlationId) {
    correlationId = generateCorrelationId();
    sessionStorage.setItem(CORRELATION_ID_KEY, correlationId);
  }

  return correlationId;
}

/**
 * Sets a new correlation ID in session storage
 */
export function setCorrelationId(id: string): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(CORRELATION_ID_KEY, id);
  }
}

/**
 * Clears the current correlation ID (e.g., on logout)
 */
export function clearCorrelationId(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(CORRELATION_ID_KEY);
  }
}

/**
 * Creates headers object with correlation ID for fetch requests
 */
export function getCorrelationHeaders(): Record<string, string> {
  return {
    [CORRELATION_ID_HEADER]: getCorrelationId(),
  };
}

/**
 * Extracts correlation ID from request headers
 */
export function extractCorrelationIdFromHeaders(
  headers: Headers | Record<string, string>
): string | null {
  if (headers instanceof Headers) {
    return headers.get(CORRELATION_ID_HEADER);
  }
  return headers[CORRELATION_ID_HEADER] || null;
}

/**
 * Rotates to a new correlation ID (e.g., on new user action)
 */
export function rotateCorrelationId(): string {
  const newId = generateCorrelationId();
  setCorrelationId(newId);
  return newId;
}

export { CORRELATION_ID_HEADER };
