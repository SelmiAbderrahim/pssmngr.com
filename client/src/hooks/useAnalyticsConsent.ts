// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState, useEffect, useCallback } from "react";
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  subscribeToConsentChanges,
  type ConsentPreferences,
} from "@/lib/consent";
import { updateGAConsent } from "@/lib/analytics/gtag";

export function useAnalyticsConsent() {
  const [preferences, setPreferences] = useState<ConsentPreferences>(
    getAnalyticsConsent,
  );

  const updateConsent = useCallback(
    (update: Partial<ConsentPreferences>) => {
      const next: ConsentPreferences = {
        ...getAnalyticsConsent(),
        ...update,
        functional: true,
      };
      setAnalyticsConsent(next);
      updateGAConsent(next.analytics);
      setPreferences({ ...next, hasResponded: true });
    },
    []
  );

  useEffect(() => {
    const unsubscribe = subscribeToConsentChanges(setPreferences);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "pssmngr_consent_preferences") {
        setPreferences(getAnalyticsConsent());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return {
    preferences,
    updateConsent,
    isLoading: false,
  };
}
