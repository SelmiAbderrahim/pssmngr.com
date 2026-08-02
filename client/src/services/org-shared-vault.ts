// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Organization Shared Vault orchestration.
 *
 * Ties together the server procedures (sharedVault.*) and the client crypto
 * (shared-vault-crypto) for the active organization's single shared vault:
 *
 *  - resolveOrgSharedVault: discover the org vault + unwrap the caller's key
 *  - setupOrgSharedVault:   owner creates the vault (wraps the key for self)
 *  - autoWrapPendingMembers: owner wraps the key for members lacking access
 *  - importPersonalItems:   owner copies their per-user org items into the vault
 *
 * Everything that touches the vault key happens client-side (zero-knowledge).
 */
import { trpcQuery, trpcMutation } from "@/lib/api/trpc";
import {
  enrollDevice,
  ensureDeviceSigningKey,
  getDecryptedPrivateKey,
  fetchMyDevicesWithEscrow,
  decryptEscrowBlob,
  adoptEscrowedDevice,
  backfillEscrowIfNeeded,
} from "@/services/keypair-manager";
import { getVaultKey } from "@/lib/vault-keys";
import { sharedVaultPermissionForOrgRole } from "@/components/vault/page/utils";
import { vaultCrypto } from "@/services/vault-crypto";
import type { ServerItemRecord } from "@/services/vault-crypto";
import {
  createSharedVaultKey,
  wrapSharedVaultKeyForMember,
  wrapSharedVaultKeyForSelf as wrapForSelf,
  unwrapSharedVaultKey,
  cacheSharedVaultKey,
  type WrappedKeyB64,
  type MemberKeyB64,
} from "@/services/shared-vault-crypto";

export interface OrgVaultAccess {
  vaultId: string;
  key: Uint8Array;
  permission: "view" | "edit" | "share" | "manage";
}

export interface GetForOrgResponse {
  exists: boolean;
  canManage: boolean;
  vaultId: string | null;
  member: boolean;
  name?: string;
  permission?: "view" | "edit" | "share" | "manage";
  needsRewrap?: boolean;
  wrappedKey?: WrappedKeyB64 & {
    senderSigningPublicKey?: string | null;
    senderSigningPublicKeys?: string[] | null;
  };
}

export type OrgVaultState =
  | { kind: "none"; canManage: boolean } // no shared vault yet
  | { kind: "pending"; canManage: boolean; vaultId: string } // vault exists, caller not granted yet
  | { kind: "ready"; canManage: boolean; access: OrgVaultAccess };

function defaultBrowserDeviceName(): string {
  if (typeof navigator === "undefined") return "Browser";
  const ua = navigator.userAgent;
  if (/firefox/i.test(ua)) return "Firefox";
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari";
  return "Browser";
}

function isMissingLocalDeviceKeyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No encrypted device key found|No encrypted signing key found|device may not be enrolled|no public key/i.test(message);
}

// Wrap the shared key for the caller's own device. The public key is derived
// locally from this device's private key (no device.getPublicKey round-trip),
// so it can't hit PRECONDITION_FAILED on accounts with multiple untrusted
// devices, and the wrap always targets the device that will unwrap it. If the
// device isn't enrolled locally yet, enroll it and retry once.
async function wrapSharedVaultKeyForSelf(
  sharedKey: Uint8Array,
  selfUserId: string,
): Promise<MemberKeyB64> {
  try {
    const wrapped = await wrapForSelf(sharedKey);
    return { userId: selfUserId, permission: "manage", ...wrapped };
  } catch (error) {
    if (!isMissingLocalDeviceKeyError(error)) throw error;

    await enrollDevice(defaultBrowserDeviceName(), "browser");
    const wrapped = await wrapForSelf(sharedKey);
    return { userId: selfUserId, permission: "manage", ...wrapped };
  }
}

async function ensureLocalSharingDevice(): Promise<void> {
  try {
    const privateKey = await getDecryptedPrivateKey();
    privateKey.fill(0);
    await ensureDeviceSigningKey();
  } catch (error) {
    if (!isMissingLocalDeviceKeyError(error)) throw error;
    await enrollDevice(defaultBrowserDeviceName(), "browser");
  }
}

/**
 * Fetch the org's shared-vault overview (existence, membership, vault id)
 * without touching any key material — safe to call while the vault is
 * locked. Pass the active workspace id to avoid racing the session's
 * active-organization sync right after login.
 */
export async function getOrgVaultOverview(
  organizationId?: string,
): Promise<GetForOrgResponse> {
  return trpcQuery<GetForOrgResponse>(
    "sharedVault",
    "getForOrg",
    organizationId ? { organizationId } : undefined,
  );
}

/** All escrow candidates tried and none could unwrap the stored envelope. */
class EscrowExhaustedError extends Error {
  constructor() {
    super("No escrowed device key could unwrap the shared vault envelope");
  }
}

function isVaultLockedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /must be unlocked/i.test(message);
}

/**
 * Escrow recovery: the stored envelope is bound to ONE device's X25519 key,
 * which this browser no longer holds. Fetch the user's devices with their
 * vault-key-encrypted private keys, try each against the envelope, and adopt
 * the first identity that works. Throws EscrowExhaustedError when every
 * deterministic attempt fails (transient/network errors are rethrown as-is
 * so the caller's retry logic — not the rewrap fallback — handles them).
 */
async function recoverKeyViaEscrow(
  wrapped: NonNullable<GetForOrgResponse["wrappedKey"]>,
): Promise<Uint8Array> {
  const vaultKey = getVaultKey();
  if (!vaultKey) {
    throw new Error("Vault must be unlocked to recover shared vault access");
  }

  const devices = await fetchMyDevicesWithEscrow(); // network error → rethrow

  for (const dev of devices) {
    if (!dev.escrowedPrivateKey) continue;
    let priv: Uint8Array;
    try {
      priv = await decryptEscrowBlob(dev.escrowedPrivateKey, vaultKey);
    } catch {
      continue; // encrypted under an older vault key — unusable
    }
    try {
      const key = await unwrapSharedVaultKey(wrapped, priv);
      await adoptEscrowedDevice(dev);
      return key;
    } catch {
      // wrong recipient device for this envelope — try the next
    } finally {
      priv.fill(0);
    }
  }

  throw new EscrowExhaustedError();
}

/**
 * Discover the active org's shared vault and, if the caller is a member,
 * unwrap their shared key (cached in memory). Requires the vault unlocked.
 *
 * Self-healing: if this browser can't unwrap the stored envelope (lost
 * IndexedDB, re-enrolled device), recovery via device-key escrow is attempted;
 * if the key is irrecoverably lost, the membership is flagged for re-wrap and
 * the caller lands in the "pending" state until a manager re-grants.
 *
 * A membership already flagged `needsRewrap` still receives the stale
 * envelope; if this browser CAN unwrap it after all, the flag is cleared by
 * re-wrapping for self (addMember upsert) — without this, a sole manager is
 * deadlocked in "pending" forever, since only they could re-grant.
 */
export async function resolveOrgSharedVault(
  organizationId?: string,
  selfUserId?: string,
): Promise<OrgVaultState> {
  const res = await getOrgVaultOverview(organizationId);

  if (!res.exists) {
    return { kind: "none", canManage: res.canManage };
  }
  if (!res.member || !res.wrappedKey || !res.vaultId) {
    await ensureLocalSharingDevice().catch((error) => {
      console.warn("[orgSharedVault] current device enrollment failed:", error);
    });
    void backfillEscrowIfNeeded();
    return { kind: "pending", canManage: res.canManage, vaultId: res.vaultId! };
  }

  let key: Uint8Array;
  try {
    key = await unwrapSharedVaultKey(res.wrappedKey);
  } catch (error) {
    if (isVaultLockedError(error)) throw error; // hook reopens the unlock modal
    try {
      key = await recoverKeyViaEscrow(res.wrappedKey);
    } catch (recoveryError) {
      if (!(recoveryError instanceof EscrowExhaustedError)) throw recoveryError;
      console.warn(
        "[orgSharedVault] device key irrecoverable; requesting re-wrap",
        error,
      );
      if (!res.needsRewrap) {
        await trpcMutation("sharedVault", "requestRewrap", {
          vaultId: res.vaultId,
        });
      }
      // Enroll fresh keys (with escrow) so a manager has a valid target.
      await ensureLocalSharingDevice().catch((enrollError) => {
        console.warn("[orgSharedVault] re-enrollment failed:", enrollError);
      });
      return { kind: "pending", canManage: res.canManage, vaultId: res.vaultId };
    }
  }
  if (res.needsRewrap && selfUserId) {
    // Flag was stale — this device unwrapped the envelope after all. Replace
    // it with a fresh self-wrap so the flag clears (addMember keeps the
    // existing permission). Best-effort: on failure we still serve the key;
    // the next resolve retries.
    try {
      const selfMember = await wrapSharedVaultKeyForSelf(key, selfUserId);
      await trpcMutation("sharedVault", "addMember", {
        vaultId: res.vaultId,
        member: selfMember,
      });
    } catch (rewrapError) {
      console.warn("[orgSharedVault] self re-wrap failed:", rewrapError);
    }
  }
  void backfillEscrowIfNeeded();
  cacheSharedVaultKey(res.vaultId, key);
  return {
    kind: "ready",
    canManage: res.canManage,
    access: { vaultId: res.vaultId, key, permission: res.permission ?? "view" },
  };
}

/**
 * Create the org's shared vault (owner/manager only). Generates the shared key
 * and wraps it for the creator. Returns access to the new vault.
 */
export async function setupOrgSharedVault(
  selfUserId: string,
  name?: string,
): Promise<OrgVaultAccess> {
  const key = await createSharedVaultKey();
  const selfMember = await wrapSharedVaultKeyForSelf(key, selfUserId);
  const created = await trpcMutation<{ id: string; existed?: boolean }>(
    "sharedVault",
    "createForOrg",
    { name, memberKeys: [selfMember] },
  );
  if (created.existed) {
    const resolved = await resolveOrgSharedVault(undefined, selfUserId);
    if (resolved.kind === "ready") {
      key.fill(0);
      return resolved.access;
    }
  }
  cacheSharedVaultKey(created.id, key);
  return { vaultId: created.id, key, permission: "manage" };
}

interface GrantableMember {
  userId: string;
  role: "owner" | "admin" | "member";
  name: string;
  email: string;
  publicKey: string | null;
  signingPublicKey?: string | null;
  /** Existing member whose device key was lost — envelope gets replaced. */
  rewrap?: boolean;
  /**
   * Permission the member should receive: their existing permission when this
   * is a rewrap, otherwise the value derived from their org role. Server always
   * supplies it now (older servers may send null → fall back to the role map).
   */
  permission?: "view" | "edit" | "share" | "manage" | null;
}

/**
 * Wrap the shared key for every org member who has enrolled keys but isn't yet
 * in the vault. Owner/manager + vault key required. Returns counts.
 */
export async function autoWrapPendingMembers(
  vaultId: string,
  key: Uint8Array,
): Promise<{ granted: number; pending: number }> {
  const candidates = await trpcQuery<GrantableMember[]>(
    "sharedVault",
    "listGrantableMembers",
    { vaultId },
  );

  let granted = 0;
  let pending = 0;
  for (const c of candidates) {
    if (!c.publicKey) {
      pending += 1; // member hasn't enrolled a device key yet
      continue;
    }
    try {
      const wrapped = await wrapSharedVaultKeyForMember(key, c.publicKey);
      await trpcMutation("sharedVault", "addMember", {
        vaultId,
        // Server derives the authoritative permission from the target's org
        // role; this role-mapped value is a fallback for older servers and the
        // rewrap path (where the server preserves the existing permission).
        member: {
          userId: c.userId,
          permission: c.permission ?? sharedVaultPermissionForOrgRole(c.role),
          ...wrapped,
        },
      });
      granted += 1;
    } catch (err) {
      console.error("[orgSharedVault] failed to grant member", c.userId, err);
      pending += 1;
    }
  }
  return { granted, pending };
}

/**
 * Background one-shot for a manager whose org has members but no shared vault
 * yet: create the shared vault, import the manager's existing per-user org
 * items (so it holds "all the org's items"), then wrap the key for every
 * pending member. Plan-gated at `createForOrg`; callers should catch and skip
 * when the org isn't entitled. Mirrors the vault page's `handleSetupSharedVault`.
 */
export async function setupImportAndGrantOrgSharedVault(
  userId: string,
  workspaceName?: string,
): Promise<{ access: OrgVaultAccess; granted: number; pending: number }> {
  const access = await setupOrgSharedVault(userId, workspaceName);
  try {
    const vaults = await trpcQuery<Array<{ id: string }>>("vault", "list");
    const perUserVaultId = vaults?.[0]?.id;
    if (perUserVaultId) {
      await importPersonalItemsIntoSharedVault(
        perUserVaultId,
        access.vaultId,
        access.key,
      );
    }
  } catch (err) {
    console.error("[orgSharedVault] auto-setup import failed:", err);
  }
  const { granted, pending } = await autoWrapPendingMembers(
    access.vaultId,
    access.key,
  );
  return { access, granted, pending };
}

interface ListResponse {
  items: ServerItemRecord[];
  nextCursor?: string;
}

/**
 * Copy the caller's existing per-user org items (the personal vault scoped to
 * this org) into the shared vault: decrypt with the personal vault key,
 * re-encrypt under the shared key. Returns the number imported.
 */
export async function importPersonalItemsIntoSharedVault(
  personalVaultId: string,
  sharedVaultId: string,
  sharedKey: Uint8Array,
): Promise<number> {
  let cursor: string | undefined;
  let imported = 0;

  do {
    const input: Record<string, unknown> = { vaultId: personalVaultId, limit: 50 };
    if (cursor) input.cursor = cursor;
    const page = await trpcQuery<ListResponse>("credentials", "list", input);

    for (const item of page.items) {
      try {
        const plaintext = await vaultCrypto.decryptServerItem(item);
        const encrypted = await vaultCrypto.encryptItemWithKey(plaintext, sharedKey);
        await trpcMutation("sharedVault", "addItem", {
          vaultId: sharedVaultId,
          itemType: item.itemType,
          ...encrypted,
        });
        imported += 1;
      } catch (err) {
        console.error("[orgSharedVault] failed to import item", item.id, err);
      }
    }
    cursor = page.nextCursor;
  } while (cursor);

  return imported;
}
