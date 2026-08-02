// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Consent Management Library
 *
 * Manages user consent preferences for GDPR/CCPA compliance.
 * Uses localStorage for persistence and provides hooks for React components.
 *
 * @module lib/consent
 */

const CONSENT_STORAGE_KEY = "pssmngr_consent_preferences";

/**
 * User consent preferences structure
 */
export interface ConsentPreferences {
  /** Analytics/tracking consent */
  analytics: boolean;
  /** Functional cookies (always true, required for site operation) */
  functional: boolean;
  /** Whether user has responded to consent banner */
  hasResponded?: boolean;
  /** Timestamp when consent was given/updated */
  timestamp?: number;
}

/**
 * Default consent preferences (all tracking disabled until user consents)
 */
const DEFAULT_PREFERENCES: ConsentPreferences = {
  analytics: false,
  functional: true,
  hasResponded: false,
};

/**
 * Get current analytics consent preferences from localStorage
 *
 * @returns Current consent preferences
 */
export function getAnalyticsConsent(): ConsentPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }

  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_PREFERENCES;
    }

    const preferences = JSON.parse(stored) as ConsentPreferences;

    // Validate structure
    if (typeof preferences.analytics !== "boolean") {
      return DEFAULT_PREFERENCES;
    }

    return {
      ...DEFAULT_PREFERENCES,
      ...preferences,
      functional: true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Set analytics consent preferences in localStorage
 *
 * @param preferences - New consent preferences
 */
export function setAnalyticsConsent(preferences: ConsentPreferences): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const prefsToStore: ConsentPreferences = {
      ...preferences,
      functional: true, // Always keep functional enabled
      timestamp: Date.now(),
      hasResponded: true,
    };

    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(prefsToStore));

    // Dispatch custom event for components to react to consent changes
    window.dispatchEvent(
      new CustomEvent("consent-change", { detail: prefsToStore })
    );
  } catch (error) {
    console.error("[Consent] Failed to save preferences:", error);
  }
}

/**
 * Check if analytics tracking is allowed
 *
 * This is the primary function to call before any analytics tracking.
 * Returns false if user hasn't responded or has declined analytics.
 *
 * @returns Whether analytics tracking is allowed
 */
export function isAnalyticsAllowed(): boolean {
  const preferences = getAnalyticsConsent();
  return preferences.hasResponded === true && preferences.analytics === true;
}

/**
 * Clear all consent preferences (for account deletion, etc.)
 */
export function clearConsentPreferences(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch (error) {
    console.error("[Consent] Failed to clear preferences:", error);
  }
}

/**
 * Update user's opt-out preference
 *
 * Allows user to opt out of analytics after initially consenting.
 *
 * @param optOut - Whether to opt out of analytics
 */
export function updateAnalyticsOptOut(optOut: boolean): void {
  const currentPrefs = getAnalyticsConsent();
  setAnalyticsConsent({
    ...currentPrefs,
    analytics: !optOut,
    hasResponded: true,
  });
}

/**
 * Get a consent-aware analytics wrapper
 *
 * Returns a function that only executes the callback if analytics consent is given.
 * Useful for wrapping analytics calls.
 *
 * @example
 * const trackIfAllowed = withAnalyticsConsent();
 * trackIfAllowed(() => trackEvent({ event_type: "page_view", ... }));
 *
 * @returns Function that conditionally executes based on consent
 */
export function withAnalyticsConsent(): (
  callback: () => void | Promise<void>
) => void {
  return (callback) => {
    if (isAnalyticsAllowed()) {
      callback();
    }
  };
}

/**
 * Subscribe to consent preference changes
 *
 * @param callback - Function to call when preferences change
 * @returns Unsubscribe function
 */
export function subscribeToConsentChanges(
  callback: (preferences: ConsentPreferences) => void
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ConsentPreferences>;
    callback(customEvent.detail);
  };

  window.addEventListener("consent-change", handler);

  return () => {
    window.removeEventListener("consent-change", handler);
  };
}
