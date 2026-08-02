// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Vault page shared types and helpers extracted from the monolithic vault route
 * from the former route monolith without changing behavior.
 */

import type { ItemType } from "@/components/vault/VaultItemCard";
import type { ServerItemRecord } from "@/services/vault-crypto";
import type { OrgVaultAccess } from "@/services/org-shared-vault";

export type TabState = "items" | "authenticators" | "sharing" | "trash";
export type FilterType = "all" | ItemType;
export type SortOption = "name" | "created" | "modified";
export type CreateType = Extract<
  ItemType,
  "login" | "note" | "card" | "identity"
>;

export interface VaultRecord {
  id: string;
  name: string;
  kdfSalt: string;
  encryptedVerificationBlob: string | null;
}

export interface ListResponse {
  items: ServerItemRecord[];
  nextCursor?: string;
}

export type VaultMode =
  | { kind: "personal" }
  | { kind: "orgShared"; access: OrgVaultAccess };

export const SHARED_PERMISSION_LEVEL: Record<
  OrgVaultAccess["permission"],
  number
> = {
  view: 1,
  edit: 2,
  share: 3,
  manage: 4,
};

/**
 * Client mirror of the server's role → shared-vault-permission mapping
 * (`packages/server/src/lib/org-permissions.ts` `sharedVaultPermissionForOrgRole`).
 * `member` → read-only `view`; `admin`/`owner` → `manage` (read/write + can
 * grant others). Keep both in sync.
 */
export function sharedVaultPermissionForOrgRole(
  role: "owner" | "admin" | "member" | string,
): OrgVaultAccess["permission"] {
  return role === "member" ? "view" : "manage";
}

export function isCreateType(value: unknown): value is CreateType {
  return (
    value === "login" ||
    value === "note" ||
    value === "card" ||
    value === "identity"
  );
}

// Turn an org shared-vault error into a user-facing message. The 412
// PRECONDITION_FAILED case (multiple devices, none trusted — fix #25) gets an
// actionable hint; everything else falls back to the raw/typed message.
export function orgVaultErrorMessage(
  err: unknown,
  t: (key: string, fallback: string) => string,
  fallback: string,
): string {
  if (typeof err === "object" && err !== null) {
    const { code, statusCode } = err as {
      code?: unknown;
      statusCode?: unknown;
    };
    if (code === "PRECONDITION_FAILED" || statusCode === 412) {
      return t(
        "sharing.errorRecipientUntrustedDevice",
        "Ask this person to trust one of their devices (Settings → Security → Trusted Devices) before sharing.",
      );
    }
  }
  return err instanceof Error ? err.message : fallback;
}
