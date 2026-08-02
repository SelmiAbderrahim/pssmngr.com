// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Offline sync types — shared between queue, worker, and hooks.
 *
 * Zero-knowledge invariant: nothing in this file is allowed to model
 * a plaintext credential field. The body of a queued mutation must be
 * the already-encrypted blob produced by `crypto/` plus only non-sensitive
 * routing metadata (vaultId, itemId, itemType, etc.).
 */

/**
 * Encrypted body shape that travels with every queued mutation.
 *
 * `payload` carries the already-encrypted credential ciphertext + nonce +
 * authTag + wrappedDataKey produced by the client crypto layer. Routing
 * fields (vaultId, itemId, itemType, isFavorite, deletedAt flags) are
 * non-sensitive and live alongside the encrypted payload so the worker
 * can replay through tRPC without ever seeing plaintext.
 */
export interface EncryptedQueueBody {
  /** Encrypted ciphertext (base64). NEVER plaintext. */
  ciphertext?: string;
  /** Encryption nonce (base64). */
  nonce?: string;
  /** AEAD authentication tag (base64). */
  authTag?: string;
  /** Wrapped per-item data key (base64). */
  wrappedDataKey?: string;
  wrappedDataKeyNonce?: string;
  wrappedDataKeyAuthTag?: string;

  // ── Non-sensitive routing metadata ──────────────────────────────
  vaultId?: string;
  itemId?: string;
  itemType?: string;
  organizationId?: string | null;
  // Anything else necessary for the server procedure to identify the
  // logical target. Plaintext credential fields MUST NEVER appear here.
  [extraNonSensitiveKey: string]: unknown;
}

/** Lifecycle of a queue entry. */
export type QueueEntryStatus = "pending" | "in_flight" | "failed";

/** Logical operation. */
export type QueueEntryOp = "create" | "update" | "delete";

/** A single durable queue entry persisted in IndexedDB. */
export interface OfflineQueueEntry {
  /** uuidv4 — the queue's own primary key. */
  id: string;
  /** ISO-8601 timestamp when the entry was enqueued. */
  createdAt: string;
  /** tRPC router (e.g. "credentials", "vault", "sharedVault"). */
  router: string;
  /** tRPC procedure (e.g. "create", "update", "softDelete"). */
  procedure: string;
  /** Logical CRUD op. */
  op: QueueEntryOp;
  /** Encrypted, non-plaintext payload + routing fields. */
  encryptedBody: EncryptedQueueBody;
  /**
   * Deterministic idempotency key derived ONLY from non-sensitive
   * identifiers — typically `sha256("vault-item:<vaultId>:<itemId>:<op>:<clientRevision>")`.
   * The server uses this to collapse retries.
   */
  idempotencyKey: string;
  status: QueueEntryStatus;
  /** Replay attempts so far. */
  attempts: number;
  /** Last replay error message (no plaintext credentials). */
  lastError?: string;
}

/** Network connectivity state. */
export interface OnlineStatus {
  isOnline: boolean;
  /** When the status last changed. */
  lastChangedAt: Date;
  /** Whether the truth source was the browser event or a health ping. */
  source: "navigator" | "ping";
}

/** Backoff schedule (ms) — exponential, capped at 5 attempts. */
export const RETRY_BACKOFFS_MS = [
  1_000, // 1 s
  5_000, // 5 s
  30_000, // 30 s
  5 * 60 * 1000, // 5 min
  60 * 60 * 1000, // 1 h
] as const;

/** Maximum number of replay attempts before an entry is marked failed. */
export const MAX_REPLAY_ATTEMPTS = RETRY_BACKOFFS_MS.length;

/** Hard cap on number of entries persisted in the queue. */
export const QUEUE_MAX_ENTRIES = 500;

/** Threshold above which cached data is rendered as "stale" amber. */
export const STALE_DATA_THRESHOLD_MS = 5 * 60 * 1000;

/** Globally-emitted browser event names for the sync layer. */
export const SYNC_EVENTS = {
  /** Emitted after the worker finishes a replay pass. */
  syncCompleted: "pssmngr:sync-completed",
  /** Emitted on every queue mutation so the banner re-renders. */
  queueChanged: "pssmngr:queue-changed",
} as const;
