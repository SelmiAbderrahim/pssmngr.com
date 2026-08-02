// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Sharing Types
 *
 * Types for the secure credential sharing feature.
 * Covers share creation, pending shares inbox, and sent shares list.
 */

export type SharePermission = "view" | "edit" | "share";
export type ShareStatus = "pending" | "accepted" | "declined" | "revoked";

/** A share record as returned by the server */
export interface ShareRecord {
  id: string;
  itemId: string;
  itemTitle: string;
  itemType: string;
  senderId: string;
  senderEmail: string;
  senderName?: string;
  recipientId: string;
  recipientEmail: string;
  recipientName?: string;
  permission: SharePermission;
  status: ShareStatus;
  createdAt: string;
  expiresAt?: string;
}

/** Input for creating a new share */
export interface ShareItemInput {
  itemId: string;
  recipientEmail: string;
  permission: SharePermission;
  envelope: {
    wrappedDataKey: string;
    nonce: string;
    authTag: string;
    ephemeralPublicKey: string;
    signature: string;
  };
}

/** User search result for recipient picker */
export interface UserSearchResult {
  id: string;
  email: string;
  name?: string;
  hasPublicKey: boolean;
}

// ── Ephemeral sharing links ──────────────────────────────────────────

export type EphemeralExpiry = "1h" | "24h" | "7d";

/** Input for creating an ephemeral share link */
export interface CreateEphemeralLinkInput {
  encryptedBlob: string;
  nonce: string;
  authTag: string;
  hasPassphrase: boolean;
  passphraseSalt: string | null;
  expiresIn: EphemeralExpiry;
  maxAccesses: number;
  ipRestriction: string | null;
  label: string | null;
}

/** Ephemeral link record as returned by list endpoint */
export interface EphemeralLinkRecord {
  id: string;
  label: string | null;
  hasPassphrase: boolean;
  expiresAt: string;
  maxAccesses: number;
  accessCount: number;
  firstAccessedAt: string | null;
  ipRestriction: string | null;
  revokedAt: string | null;
  createdAt: string;
}
