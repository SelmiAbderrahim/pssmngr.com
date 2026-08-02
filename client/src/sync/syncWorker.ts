// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Sync worker — replays queued offline mutations through tRPC once
 * connectivity is restored. Exponential backoff per entry, max 5
 * attempts. Idempotency keys are already on the entry, so a server
 * replay returning the cached response is treated as success.
 *
 * The worker stays in the main thread (no Web Worker required — the
 * encrypted blobs are tiny and crypto is already on the main thread).
 *
 * @module sync/syncWorker
 */
import { trpcMutation } from "@/lib/api/trpc";
import {
  type OfflineQueueEntry,
  RETRY_BACKOFFS_MS,
  MAX_REPLAY_ATTEMPTS,
  SYNC_EVENTS,
} from "./types";
import {
  peekAll,
  dequeue,
  markInFlight,
  markPending,
  markFailed,
} from "./offlineQueue";

let _running = false;

export interface SyncResult {
  succeeded: number;
  failed: number;
  remaining: number;
}

/**
 * Sleep helper that respects an abort signal so tests can short-circuit.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener?.("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/**
 * Decide whether an entry is eligible for the next replay attempt
 * based on its attempt count and the elapsed time since `createdAt`.
 *
 * The backoff schedule is age-based (not last-attempt-based) so a
 * fresh page reload doesn't reset the clock and immediately re-fire
 * every entry.
 */
function shouldAttempt(entry: OfflineQueueEntry, now: number): boolean {
  if (entry.status === "failed") return false;
  if (entry.attempts >= MAX_REPLAY_ATTEMPTS) return false;
  const elapsed = now - Date.parse(entry.createdAt);
  // Sum of backoffs already consumed by previous attempts.
  let cooldown = 0;
  for (let i = 0; i < entry.attempts; i++) {
    cooldown += RETRY_BACKOFFS_MS[i] ?? 0;
  }
  return elapsed >= cooldown;
}

/**
 * Replay one entry through the tRPC mutation wrapper.
 *
 * The encryptedBody is spread onto the request — the server expects
 * fields like `vaultId`, `itemId`, `ciphertext`, `nonce`, etc. We also
 * attach the `idempotencyKey` so the server can collapse retries.
 */
async function replayOne(entry: OfflineQueueEntry): Promise<void> {
  await markInFlight(entry.id);
  try {
    await trpcMutation(entry.router, entry.procedure, {
      ...entry.encryptedBody,
      idempotencyKey: entry.idempotencyKey,
    });
    await dequeue(entry.id);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
    if (entry.attempts + 1 >= MAX_REPLAY_ATTEMPTS) {
      await markFailed(entry.id, message);
    } else {
      await markPending(entry.id);
    }
    throw err;
  }
}

/**
 * Walk the queue once, replaying every eligible entry in createdAt order.
 * Safe to call concurrently — re-entrant calls return immediately.
 */
export async function flush(
  options: { signal?: AbortSignal } = {},
): Promise<SyncResult> {
  if (_running) return { succeeded: 0, failed: 0, remaining: 0 };
  _running = true;

  let succeeded = 0;
  let failed = 0;

  try {
    const all = await peekAll();
    const now = Date.now();
    const eligible = all.filter((e) => shouldAttempt(e, now));

    for (const entry of eligible) {
      if (options.signal?.aborted) break;
      try {
        await replayOne(entry);
        succeeded += 1;
      } catch {
        failed += 1;
        // Small jitter between failures so we don't hammer a flaky link.
        await sleep(250, options.signal);
      }
    }

    const remaining = (await peekAll()).length;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(SYNC_EVENTS.syncCompleted, {
          detail: { succeeded, failed, remaining },
        }),
      );
    }
    return { succeeded, failed, remaining };
  } finally {
    _running = false;
  }
}

/**
 * Schedule periodic flushes while online + an immediate flush whenever
 * the online transition fires. Returns a teardown function.
 */
export function startSyncWorker(options: {
  isOnline: () => boolean;
  intervalMs?: number;
} = { isOnline: () => true }): () => void {
  const interval = options.intervalMs ?? 30_000;
  const controller = new AbortController();

  // Re-flush whenever someone enqueues — keeps latency low when online.
  const onChange = () => {
    if (options.isOnline()) void flush({ signal: controller.signal });
  };

  if (typeof window !== "undefined") {
    window.addEventListener(SYNC_EVENTS.queueChanged, onChange);
    window.addEventListener("online", onChange);
  }

  const tick = setInterval(() => {
    if (options.isOnline()) void flush({ signal: controller.signal });
  }, interval);

  // Kick once on startup in case there's a leftover from a previous session.
  if (options.isOnline()) void flush({ signal: controller.signal });

  return () => {
    controller.abort();
    clearInterval(tick);
    if (typeof window !== "undefined") {
      window.removeEventListener(SYNC_EVENTS.queueChanged, onChange);
      window.removeEventListener("online", onChange);
    }
  };
}
