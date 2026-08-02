// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Vault-key gate around the in-memory key derived from the master password.
 *
 * The derived key (from `crypto/key-derivation.ts`, in-memory only via
 * `client/src/lib/vault-keys.ts`) decrypts every piece of vault ciphertext.
 * Threat-model constraints (zero-knowledge):
 *   - The derived key is NEVER persisted in `Preferences`, `localStorage`,
 *     IndexedDB, the service-worker cache, or any other storage. Re-running
 *     `unlock()` re-derives it.
 *   - The key is NEVER attached to `window` / `globalThis`. Holding it is
 *     delegated to the existing module-private `vault-keys` store.
 *   - The key is NEVER logged or sent to analytics.
 */

import { vaultCrypto } from "@/services/vault-crypto";
import { hasVaultKey, clearVaultKey } from "@/lib/vault-keys";
import { isEnabled as isPersistentUnlockEnabled } from "@/lib/persistent-unlock";

/* ─────────────────────────────────────────────────────────────────── */
/*  Master-password fallback hook                                      */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Bridge to the existing master-password re-entry modal. The UI layer
 * installs the prompt; this gate calls into it whenever biometrics are
 * unavailable or the user cancels.
 *
 * The promise must resolve with the master password (string) or null on
 * cancel. The password is then passed straight to vault-crypto's existing
 * `unlock()` flow which re-derives the key client-side and never sends it
 * to the server.
 */
export type MasterPasswordPrompt = () => Promise<string | null>;

let _masterPasswordPrompt: MasterPasswordPrompt | null = null;

export function registerMasterPasswordPrompt(prompt: MasterPasswordPrompt | null): void {
  _masterPasswordPrompt = prompt;
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Public API                                                         */
/* ─────────────────────────────────────────────────────────────────── */

export interface UnlockOptions {
  /** Reserved for callers that need to describe the unlock action. */
  reason?: string;
}

export type UnlockOutcome =
  | { ok: true; via: "already-unlocked" | "password" }
  | { ok: false; reason: "cancelled" | "no-prompt-installed" | "unlock-failed" };

/**
 * Decrypts using the in-memory key only if currently unlocked. The
 * `vaultCrypto` service is the single owner of the actual key material;
 * we just gate access to it.
 */
export function isUnlocked(): boolean {
  return vaultCrypto.isUnlocked();
}

/**
 * Drop the in-memory key. Called on app background, idle timeout, logout,
 * and as a defensive measure on cold start.
 */
export function lock(): void {
  // Delegate to vault-crypto so its listeners (UI state) fire too.
  vaultCrypto.lock();
  // Defensive: also wipe the raw key store in case anyone bypassed
  // vault-crypto (should never happen, but cheap insurance).
  clearVaultKey();
}

/**
 * Open the vault using the existing master-password prompt. The prompt owns
 * key derivation; this gate only checks the resulting in-memory state.
 */
export async function unlock(options: UnlockOptions = {}): Promise<UnlockOutcome> {
  if (isUnlocked()) {
    return { ok: true, via: "already-unlocked" };
  }

  if (!_masterPasswordPrompt) {
    return { ok: false, reason: "no-prompt-installed" };
  }

  const password = await _masterPasswordPrompt();
  if (!password) {
    return { ok: false, reason: "cancelled" };
  }

  // The existing vault-crypto.unlock() expects (password, salt, expectedKeyHash?).
  // We do not own those parameters here — the calling UI does. The
  // master-password prompt implementation is responsible for invoking
  // vault-crypto.unlock(...) before returning the password to us, which
  // mirrors the existing web flow. We only verify the result.
  if (isUnlocked()) {
    return { ok: true, via: "password" };
  }

  void options;
  return { ok: false, reason: "unlock-failed" };
}

/**
 * Convenience: ensure the vault is unlocked before performing a
 * vault-touching operation. Throws a tagged error rather than silently
 * decrypting with a stale key.
 */
export async function requireUnlocked(reason?: string): Promise<void> {
  if (isUnlocked()) return;
  const outcome = await unlock({ reason });
  if (!outcome.ok) {
    const err = new Error("Vault is locked");
    (err as Error & { code?: string }).code = "VAULT_LOCKED";
    throw err;
  }
}

/**
 * Reports whether a wrapped, at-rest vault key currently exists on this
 * device (see `lib/persistent-unlock.ts`). The key material itself is
 * non-extractable; only the boolean is exposed here.
 *
 * This is the seam a future trusted unlock adapter would gate before
 * calling `tryRestore()` — biometrics must pass FIRST or persistence is
 * effectively unauthenticated.
 */
export async function isKeyPersistedAnywhere(): Promise<boolean> {
  return isPersistentUnlockEnabled();
}

/** Verify the underlying key store is actually empty after a lock(). */
export function assertLocked(): void {
  if (hasVaultKey()) {
    throw new Error("VaultKeyGate invariant violated: key present after lock()");
  }
}

export const vaultKeyGate = {
  isUnlocked,
  lock,
  unlock,
  requireUnlocked,
  registerMasterPasswordPrompt,
};
