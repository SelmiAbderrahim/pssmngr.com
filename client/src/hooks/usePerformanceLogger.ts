// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * React hook for logging component performance metrics
 * Tracks mount times, render counts, and optional debug information
 */

import { useEffect, useRef } from 'react';
import { getLogger } from '@/lib/logger';

interface PerformanceMetrics {
  mountTime: number;
  unmountTime?: number;
  renderCount: number;
  lastRenderDuration?: number;
}

interface UsePerformanceLoggerOptions {
  componentName: string;
  enabled?: boolean;
  logLevel?: 'debug' | 'trace';
  trackRenders?: boolean;
}

export function usePerformanceLogger(options: UsePerformanceLoggerOptions): void {
  const {
    componentName,
    enabled = import.meta.env.DEV,
    logLevel = 'debug',
    trackRenders = false,
  } = options;

  const metricsRef = useRef<PerformanceMetrics>({
    mountTime: 0,
    renderCount: 0,
  });

  const renderStartRef = useRef<number>(0);
  const loggerRef = useRef(getLogger());

  // Track render start
  if (enabled && trackRenders) {
    renderStartRef.current = performance.now();
  }

  useEffect(() => {
    if (!enabled) return;

    const logger = loggerRef.current;

    // Track mount time
    metricsRef.current.mountTime = performance.now();
    logger[logLevel](`${componentName} mounted`, {
      function: componentName,
      performance: {
        duration: metricsRef.current.mountTime,
      },
    });

    return () => {
      // Track unmount time and total lifetime
      metricsRef.current.unmountTime = performance.now();
      const lifetime = metricsRef.current.unmountTime - metricsRef.current.mountTime;

      logger[logLevel](`${componentName} unmounted`, {
        function: componentName,
        performance: {
          duration: lifetime,
          renderCount: metricsRef.current.renderCount,
        },
      });
    };
  }, [componentName, enabled, logLevel]);

  // Track render count
  useEffect(() => {
    if (!enabled || !trackRenders) return;

    metricsRef.current.renderCount++;
    const renderDuration = performance.now() - renderStartRef.current;
    metricsRef.current.lastRenderDuration = renderDuration;

    // Only log if render is slow (>16ms for 60fps)
    if (renderDuration > 16) {
      loggerRef.current.debug(`${componentName} slow render detected`, {
        function: componentName,
        performance: {
          duration: renderDuration,
          renderCount: metricsRef.current.renderCount,
        },
      });
    }
  });
}
