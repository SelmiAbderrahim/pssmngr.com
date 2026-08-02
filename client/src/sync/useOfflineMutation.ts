// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useOfflineMutation
 *
 * Wraps the tRPC mutation pattern so a UI caller can write code once
 * and have it Do The Right Thing both online and offline.
 *
 * Caller contract:
 *   - The caller must encrypt its payload via `crypto/` BEFORE
 *     handing it to this hook (zero-knowledge guarantee — the queue
 *     never sees plaintext).
 *   - The caller supplies an `idempotencyKey` that's deterministic per
 *     logical mutation, derived from non-sensitive identifiers only.
 *
 * Behaviour:
 *   - Online: behaves exactly like the existing trpcMutation wrapper.
 *   - Offline: enqueues the encrypted payload, optimistically updates
 *     the TanStack Query cache via the caller-supplied callback, and
 *     resolves with a synthetic success object so the UI doesn't see
 *     a thrown error.
 *
 * @module sync/useOfflineMutation
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpcMutation } from "@/lib/api/trpc";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { enqueue } from "./offlineQueue";
import type { EncryptedQueueBody, QueueEntryOp } from "./types";

export interface UseOfflineMutationOptions<TResult> {
  router: string;
  procedure: string;
  op: QueueEntryOp;
  /**
   * Optimistic update applied to the TanStack Query cache when the
   * mutation is enqueued offline. Receives the encrypted body so the
   * caller can update its local cache without ever decrypting.
   */
  optimisticUpdate?: (encryptedBody: EncryptedQueueBody) => void;
  /**
   * Synthetic result to resolve with when offline. Defaults to
   * `{ offline: true }` — callers can pass a richer shape if their
   * UI needs e.g. a temporary id.
   */
  offlineResult?: (encryptedBody: EncryptedQueueBody) => TResult;
}

export interface OfflineMutationInput {
  encryptedBody: EncryptedQueueBody;
  /** Idempotency key derived from non-sensitive identifiers. */
  idempotencyKey: string;
}

export interface OfflineMutationResult<TResult> {
  online: boolean;
  data: TResult | { offline: true };
}

/**
 * Hook returns a single `mutateOfflineAware` callable. When online,
 * it returns the server response unchanged. When offline, it enqueues
 * and resolves with `offlineResult` (or a default sentinel).
 */
export function useOfflineMutation<TResult = unknown>(
  options: UseOfflineMutationOptions<TResult>,
) {
  const { isOnline } = useOnlineStatus();
  const queryClient = useQueryClient();

  const mutateOfflineAware = useCallback(
    async (input: OfflineMutationInput): Promise<OfflineMutationResult<TResult>> => {
      if (isOnline) {
        const data = await trpcMutation<TResult>(options.router, options.procedure, {
          ...input.encryptedBody,
          idempotencyKey: input.idempotencyKey,
        });
        return { online: true, data };
      }

      // Offline path — apply optimistic cache update, enqueue, return synthetic.
      options.optimisticUpdate?.(input.encryptedBody);

      await enqueue({
        router: options.router,
        procedure: options.procedure,
        op: options.op,
        encryptedBody: input.encryptedBody,
        idempotencyKey: input.idempotencyKey,
      });

      // Nudge any list queries so the banner badge updates.
      void queryClient.invalidateQueries({
        queryKey: ["offline-queue"],
        exact: false,
      });

      const data = options.offlineResult
        ? options.offlineResult(input.encryptedBody)
        : ({ offline: true } as const);
      return { online: false, data };
    },
    [isOnline, options, queryClient],
  );

  return { mutateOfflineAware, isOnline };
}

/**
 * Deterministic idempotency key helper.
 *
 * Returns `vault-item:<vaultId>:<itemId>:<op>:<clientRevision>` — a
 * stable identifier the server uses to collapse retries. Plaintext
 * never enters the input. `clientRevision` should be the next monotonic
 * integer for that item (start at 1 for create, +1 per update).
 */
export function buildVaultItemIdempotencyKey(meta: {
  vaultId: string;
  itemId: string;
  op: QueueEntryOp;
  clientRevision: number;
}): string {
  return `vault-item:${meta.vaultId}:${meta.itemId}:${meta.op}:${meta.clientRevision}`;
}
