// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Emergency Access types for the client.
 */

// ---------------------------------------------------------------------------
// Trusted contacts
// ---------------------------------------------------------------------------

export interface TrustedContact {
  id: string;
  waitingPeriodDays: number;
  createdAt: string;
  contact: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

// ---------------------------------------------------------------------------
// Access requests
// ---------------------------------------------------------------------------

export type EmergencyRequestStatus = "pending" | "denied" | "approved" | "expired";

export interface EmergencyAccessRequest {
  id: string;
  status: EmergencyRequestStatus;
  waitingPeriodDays: number;
  requestedAt: string;
  expiresAt: string;
  deniedAt: string | null;
  grantedAt: string | null;
  owner: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  contact: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

// ---------------------------------------------------------------------------
// Escrow
// ---------------------------------------------------------------------------

/** Server-stored escrow blob (base64 encoded). */
export interface EscrowBlobResponse {
  escrowBlob: string;
  escrowNonce: string;
  escrowAuthTag: string;
  ephemeralPublicKey: string;
  escrowSignature: string | null;
}

/** Input for pre-storing escrow when adding a trusted contact. */
export interface EscrowInput {
  escrowBlob: string;
  escrowNonce: string;
  escrowAuthTag: string;
  ephemeralPublicKey: string;
  escrowSignature: string;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export type EmergencyAuditEvent =
  | "request_created"
  | "request_denied"
  | "request_granted"
  | "request_auto_granted"
  | "request_expired"
  | "signature_verified"
  | "signature_failed"
  | "cooldown_blocked";

export interface EmergencyAuditEntry {
  id: string;
  event: EmergencyAuditEvent;
  actorId: string | null;
  metadata: string | null;
  createdAt: string;
}
