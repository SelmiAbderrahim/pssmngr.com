// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Durable client-side offline mutation queue.
 *
 * Backed by IndexedDB via `idb-keyval`. Every entry stores ONLY the
 * encrypted ciphertext blob + non-sensitive routing metadata. Plaintext
 * vault contents, the master password, and derived keys MUST NEVER land
 * here — encryption happens BEFORE `enqueue()` is called.
 *
 * @module sync/offlineQueue
 */
import { createStore, get, set, del, keys as idbKeys } from "idb-keyval";
import {
  type EncryptedQueueBody,
  type OfflineQueueEntry,
  type QueueEntryOp,
  QUEUE_MAX_ENTRIES,
  SYNC_EVENTS,
} from "./types";

/** IDB database + store names — namespaced under pssmngr. */
const DB_NAME = "pssmngr-offline-queue";
const STORE_NAME = "mutations";

let _store: ReturnType<typeof createStore> | null = null;
function getStore() {
  // Lazy create so SSR / test environments without indexedDB don't choke
  // until the queue is actually used.
  if (!_store) _store = createStore(DB_NAME, STORE_NAME);
  return _store;
}

/** Plaintext-leak guard. Rejects entries containing common plaintext keys. */
const PLAINTEXT_FORBIDDEN_KEYS = new Set([
  "password",
  "masterPassword",
  "secret",
  "plaintext",
  "decrypted",
  "vaultKey",
  "dataKey",
  "privateKey",
  "totpSecret",
  "noteBody",
  "note",
]);

function assertEncryptedBody(body: EncryptedQueueBody): void {
  for (const k of Object.keys(body)) {
    if (PLAINTEXT_FORBIDDEN_KEYS.has(k)) {
      throw new Error(
        `offlineQueue: refusing to persist plaintext field "${k}". ` +
          `Encrypt the payload via crypto/ before enqueuing.`,
      );
    }
  }
}

/** Input to {@link enqueue}. The queue assigns id/status/attempts/createdAt. */
export interface EnqueueInput {
  router: string;
  procedure: string;
  op: QueueEntryOp;
  encryptedBody: EncryptedQueueBody;
  idempotencyKey: string;
}

function generateId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  // RFC4122 v4 fallback for very old test envs
  const buf = new Uint8Array(16);
  cryptoObj?.getRandomValues?.(buf) ?? buf.forEach((_, i) => (buf[i] = Math.floor(Math.random() * 256)));
  buf[6] = ((buf[6] ?? 0) & 0x0f) | 0x40;
  buf[8] = ((buf[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function emitChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SYNC_EVENTS.queueChanged));
  }
}

/**
 * Persist a new encrypted mutation to the queue.
 *
 * @throws if the body contains a known plaintext field.
 */
export async function enqueue(input: EnqueueInput): Promise<OfflineQueueEntry> {
  assertEncryptedBody(input.encryptedBody);

  // Enforce the 500-entry cap by dropping the oldest non-failed pending
  // entries first; failed entries are kept so the user can inspect them.
  const all = await peekAll();
  if (all.length >= QUEUE_MAX_ENTRIES) {
    const overflow = all
      .filter((e) => e.status !== "failed")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, all.length - QUEUE_MAX_ENTRIES + 1);
    for (const dropped of overflow) {
      await del(dropped.id, getStore());
    }
    // Emit a one-off warning event for the UI to surface.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("pssmngr:queue-overflow", {
          detail: { dropped: overflow.length },
        }),
      );
    }
  }

  const entry: OfflineQueueEntry = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    router: input.router,
    procedure: input.procedure,
    op: input.op,
    encryptedBody: input.encryptedBody,
    idempotencyKey: input.idempotencyKey,
    status: "pending",
    attempts: 0,
  };

  await set(entry.id, entry, getStore());
  emitChange();
  return entry;
}

/** Remove an entry (called after successful replay). */
export async function dequeue(id: string): Promise<void> {
  await del(id, getStore());
  emitChange();
}

/** Return all entries sorted by createdAt ascending (oldest first). */
export async function peekAll(): Promise<OfflineQueueEntry[]> {
  const ids = (await idbKeys(getStore())) as string[];
  const entries: OfflineQueueEntry[] = [];
  for (const id of ids) {
    const e = (await get(id, getStore())) as OfflineQueueEntry | undefined;
    if (e) entries.push(e);
  }
  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Count of entries not in `failed`. Used by the offline banner. */
export async function pendingCount(): Promise<number> {
  const all = await peekAll();
  return all.filter((e) => e.status !== "failed").length;
}

export async function markInFlight(id: string): Promise<void> {
  const entry = (await get(id, getStore())) as OfflineQueueEntry | undefined;
  if (!entry) return;
  entry.status = "in_flight";
  entry.attempts += 1;
  await set(id, entry, getStore());
  emitChange();
}

export async function markPending(id: string): Promise<void> {
  const entry = (await get(id, getStore())) as OfflineQueueEntry | undefined;
  if (!entry) return;
  entry.status = "pending";
  await set(id, entry, getStore());
  emitChange();
}

export async function markFailed(id: string, err: string): Promise<void> {
  const entry = (await get(id, getStore())) as OfflineQueueEntry | undefined;
  if (!entry) return;
  entry.status = "failed";
  // Never persist plaintext credentials in error messages — slice defensively.
  entry.lastError = String(err).slice(0, 500);
  await set(id, entry, getStore());
  emitChange();
}

/** Wipe the entire queue. Used on sign-out and in tests. */
export async function clearAll(): Promise<void> {
  const ids = (await idbKeys(getStore())) as string[];
  for (const id of ids) {
    await del(id, getStore());
  }
  emitChange();
}
