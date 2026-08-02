// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Silent-restore step for the auth gate. Extracted from `_auth.tsx` so the
 * ordering invariant (R4: restore + verify BEFORE the gate resolves to
 * "ready") is unit-testable without spinning up the whole route tree.
 */

import { tryRestore, clearPersistence } from "@/lib/persistent-unlock";
import { vaultCrypto } from "@/services/vault-crypto";
import { getDeviceId } from "@/lib/device-keys";
import { trpcQuery } from "@/lib/api/trpc";

/**
 * Ask the server whether this device's persistent-unlock grant is still
 * live. Returns:
 *   - `"revoked"` when the server definitively says the grant is gone
 *     (column null — what revoke / revoke-all writes — or expiry in the past),
 *   - `"ok"` when the server confirms a future expiry, and
 *   - `"ok"` on any failure (offline, unenrolled device). Fail-open is
 *     deliberate: the app is offline-capable and the local envelope's own
 *     expiry still bounds the grant; revocation propagates on the next
 *     online session start.
 */
async function serverGrantStatus(): Promise<"ok" | "revoked"> {
  try {
    const deviceId = await getDeviceId();
    if (!deviceId) return "ok";
    const res = await trpcQuery<{ expiresAt: string | Date | null }>(
      "device",
      "getPersistentUnlockExpiry",
      { deviceId },
    );
    // Dates arrive as ISO strings over JSON.
    if (res.expiresAt == null) return "revoked";
    const expiry = new Date(res.expiresAt).getTime();
    if (Number.isNaN(expiry) || expiry <= Date.now()) return "revoked";
    return "ok";
  } catch {
    return "ok";
  }
}

/**
 * Attempt to silently restore the vault key from at-rest storage. Returns
 * `true` when the key is restored AND verified against `verificationBlob`,
 * meaning downstream callers can assume the vault is unlocked at gate-mount
 * time (R4). Any failure — no wrap, decrypt error, sentinel mismatch,
 * server-side revocation — clears the local record and returns `false`
 * (never trusts an unverified or revoked key).
 */
export async function restoreVaultKeyIfPossible(
  verificationBlob: string | null | undefined,
): Promise<boolean> {
  if (!verificationBlob) return false;
  if (vaultCrypto.isUnlocked()) return true;
  const restored = await tryRestore();
  if (!restored) return false;
  // Server-side revocation check: a grant revoked from
  // another session must not silently restore here, even though the local
  // envelope is still within its window.
  if ((await serverGrantStatus()) === "revoked") {
    await clearPersistence();
    restored.fill(0);
    return false;
  }
  const ok = await vaultCrypto.verifyVaultKeyWithKey(restored, verificationBlob);
  if (!ok) {
    // Sentinel mismatch = corrupt / stale wrap. Fail closed.
    await clearPersistence();
    // Zero the failed candidate before dropping the reference.
    restored.fill(0);
    return false;
  }
  vaultCrypto.setKey(restored);
  return true;
}
