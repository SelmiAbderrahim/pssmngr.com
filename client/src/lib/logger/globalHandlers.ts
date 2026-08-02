// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Global error handlers for uncaught exceptions and promise rejections
 * Ensures no errors go unlogged
 */

import { getLogger } from './index';

let isInitialized = false;

export function setupGlobalErrorHandlers(): void {
  if (isInitialized) return;
  if (typeof window === 'undefined') return;

  const logger = getLogger();

  // Handle uncaught exceptions
  window.onerror = (
    message: string | Event,
    source?: string,
    lineno?: number,
    colno?: number,
    error?: Error
  ) => {
    logger.error('Uncaught exception', {
      function: 'globalErrorHandler',
      error: error || new Error(String(message)),
      message: String(message),
      source,
      lineno,
      colno,
    });

    // Don't prevent default error handling
    return false;
  };

  // Handle unhandled promise rejections
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));

    logger.error('Unhandled promise rejection', {
      function: 'unhandledRejectionHandler',
      error,
      reason: event.reason,
    });
  };

  // Log when the page becomes hidden (potential data loss point)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      logger.debug('Page visibility changed to hidden', {
        function: 'visibilityChangeHandler',
      });
    }
  });

  // Log before page unload
  window.addEventListener('beforeunload', () => {
    logger.info('Page unloading', {
      function: 'beforeUnloadHandler',
    });
  });

  // Log online/offline status changes
  window.addEventListener('online', () => {
    logger.info('Network connection restored', {
      function: 'networkStatusHandler',
    });
  });

  window.addEventListener('offline', () => {
    logger.warn('Network connection lost', {
      function: 'networkStatusHandler',
    });
  });

  isInitialized = true;
  logger.debug('Global error handlers initialized', {
    function: 'setupGlobalErrorHandlers',
  });
}

export function teardownGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  window.onerror = null;
  window.onunhandledrejection = null;
  isInitialized = false;
}
