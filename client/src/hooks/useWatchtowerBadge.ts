// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Hook for the watchtower nav badge.
 *
 * Subscribes to the WatchtowerScanService singleton and triggers
 * background scanning on vault unlock. Returns the issue count
 * for rendering a badge in the sidebar.
 */

import { useState, useEffect } from "react";
import {
  watchtowerScan,
  type WatchtowerScanState,
} from "@/services/watchtower-scan";
import { vaultCrypto } from "@/services/vault-crypto";

export function useWatchtowerBadge() {
  const [state, setState] = useState<WatchtowerScanState | null>(
    watchtowerScan.getState(),
  );

  // Subscribe to scan state changes
  useEffect(() => {
    return watchtowerScan.subscribe(setState);
  }, []);

  // Start/stop background scan based on vault lock state
  useEffect(() => {
    const unsubscribe = vaultCrypto.subscribe((isUnlocked) => {
      if (isUnlocked) {
        watchtowerScan.startBackgroundScan();
      } else {
        watchtowerScan.stopBackgroundScan();
      }
    });

    // If vault is already unlocked when hook mounts, start scan
    if (vaultCrypto.isUnlocked()) {
      watchtowerScan.startBackgroundScan();
    }

    return unsubscribe;
  }, []);

  return {
    issueCount: state?.issueCount ?? 0,
    score: state?.score ?? null,
    lastScanAt: state?.lastScanAt ?? null,
  };
}
