// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * React hook for vault crypto state.
 *
 * Provides reactive lock/unlock state, activity-based auto-lock reset,
 * and convenience wrappers around VaultCryptoService encrypt/decrypt.
 */

import { useState, useEffect, useCallback } from "react";
import {
  vaultCrypto,
  type EncryptedItemPayload,
} from "@/services/vault-crypto";

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
] as const;

export function useVaultCrypto() {
  const [isUnlocked, setIsUnlocked] = useState(vaultCrypto.isUnlocked());
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to vault state changes
  useEffect(() => {
    return vaultCrypto.subscribe(setIsUnlocked);
  }, []);

  // Reset auto-lock timer on user activity while unlocked
  useEffect(() => {
    if (!isUnlocked) return;

    const reset = () => vaultCrypto.resetAutoLock();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, reset, { passive: true });
    }

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, reset);
      }
    };
  }, [isUnlocked]);

  const unlock = useCallback(
    async (
      masterPassword: string,
      salt: Uint8Array,
      secretKey?: Uint8Array,
    ) => {
      setIsUnlocking(true);
      setError(null);
      try {
        await vaultCrypto.unlock(masterPassword, salt, secretKey);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to unlock vault";
        setError(message);
        throw err;
      } finally {
        setIsUnlocking(false);
      }
    },
    [],
  );

  const lock = useCallback(() => {
    vaultCrypto.lock();
  }, []);

  const encryptItem = useCallback(
    async (plaintext: Record<string, unknown>): Promise<EncryptedItemPayload> => {
      return vaultCrypto.encryptItem(plaintext);
    },
    [],
  );

  const decryptItem = useCallback(
    async (payload: EncryptedItemPayload): Promise<Record<string, unknown>> => {
      return vaultCrypto.decryptItem(payload);
    },
    [],
  );

  return {
    isUnlocked,
    isUnlocking,
    error,
    unlock,
    lock,
    encryptItem,
    decryptItem,
  } as const;
}
