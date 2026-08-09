// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * In-memory vault key store.
 *
 * The derived vault key is held ONLY in memory — never written to
 * localStorage, sessionStorage, IndexedDB, or any persistent store.
 * Closing the tab / navigating away clears it automatically.
 */

let _vaultKey: Uint8Array | null = null;

export function setVaultKey(key: Uint8Array): void {
  // Zero previous key before replacing (guard against same-reference self-zeroing)
  if (_vaultKey && _vaultKey !== key) _vaultKey.fill(0);
  _vaultKey = key;
}

export function getVaultKey(): Uint8Array | null {
  return _vaultKey ? new Uint8Array(_vaultKey) : null;
}

export function clearVaultKey(): void {
  if (_vaultKey) {
    _vaultKey.fill(0);
    _vaultKey = null;
  }
}

export function hasVaultKey(): boolean {
  return _vaultKey !== null;
}
