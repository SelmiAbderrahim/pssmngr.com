// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Network request logger that wraps fetch
 * Adds correlation IDs and logs all network activity
 */

import { getLogger } from './index';
import { getCorrelationHeaders } from './correlation';

let isInitialized = false;
let originalFetch: typeof fetch;

export function setupNetworkLogging(): void {
  if (isInitialized) return;
  if (typeof window === 'undefined') return;

  originalFetch = window.fetch;
  const logger = getLogger();

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    const startTime = performance.now();
    const requestId = Math.random().toString(36).substring(7);

    // Add correlation ID header
    const correlationHeaders = getCorrelationHeaders();
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : {}));

    Object.entries(correlationHeaders).forEach(([key, value]) => {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    });

    const enhancedInit: RequestInit = {
      ...init,
      headers,
    };

    logger.debug('Network request started', {
      function: 'networkLogger',
      requestId,
      url,
      method,
    });

    try {
      const response = await originalFetch(input, enhancedInit);
      const duration = performance.now() - startTime;

      const logLevel = response.ok ? 'debug' : 'warn';
      logger[logLevel]('Network request completed', {
        function: 'networkLogger',
        requestId,
        url,
        method,
        status: response.status,
        statusText: response.statusText,
        performance: { duration },
      });

      return response;
    } catch (error) {
      const duration = performance.now() - startTime;

      logger.error('Network request failed', {
        function: 'networkLogger',
        requestId,
        url,
        method,
        error: error instanceof Error ? error : new Error(String(error)),
        performance: { duration },
      });

      throw error;
    }
  };

  isInitialized = true;
  logger.debug('Network logging initialized', {
    function: 'setupNetworkLogging',
  });
}

export function teardownNetworkLogging(): void {
  if (typeof window === 'undefined') return;
  if (originalFetch) {
    window.fetch = originalFetch;
  }
  isInitialized = false;
}
