// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Encrypted batch save.
 *
 * The one place that turns a list of plaintext items into bounded ciphertext
 * mutations. Both `useVaultItems.handleBulkCreateItems` and the import pipeline
 * call this, so there is a single batching, idempotency, and failure-mapping
 * implementation rather than two that can drift apart.
 *
 * Plaintext is passed to the caller-supplied `encrypt` function and nowhere
 * else. `submit` only ever receives ciphertext envelopes and a non-secret
 * idempotency key.
 */

/** Server-side ceiling for one batch mutation. */
export const BULK_BATCH_SIZE = 50;

/**
 * Operation ids feed idempotency keys that the server stores, so they are
 * restricted to a non-secret, key-safe shape.
 */
const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface EncryptedEnvelope {
  ciphertext: string;
  nonce: string;
  authTag: string;
  wrappedDataKey: string;
  wrappedDataKeyNonce: string;
  wrappedDataKeyAuthTag: string;
}

export interface BulkSaveEntry {
  /** Stable, non-secret key identifying this row to the caller. */
  key: string;
  /** Server item type. Non-secret. */
  itemType: string;
  /** Plaintext item data. Encrypted here; never submitted as-is. */
  data: Record<string, unknown>;
  /**
   * Batch this row belongs to within the operation. Omit on a first run — it
   * is then derived from position. On a retry the caller passes each row's
   * original index so the retried batch reuses its idempotency key and covers
   * the same item set, which is what makes the replay safe.
   */
  batchIndex?: number;
}

export interface BulkSaveProgress {
  /** Items the server confirmed saving so far. */
  saved: number;
  /** Items submitted to this run. */
  total: number;
  /** 1-based index of the batch that just settled. */
  batch: number;
  /** Total batches in this run. */
  batches: number;
}

export interface BulkSaveFailure {
  /** Original key of the row that failed. */
  key: string;
  /** Batch this row belonged to, so a retry can reuse the same key. */
  batchIndex: number;
  stage: "encrypt" | "save";
  /**
   * Reason from the crypto helper or the transport. Derived from the thrown
   * error only — it never carries item content.
   */
  message: string;
}

export interface BulkSaveResult {
  /** Original keys the server confirmed saving. */
  saved: string[];
  /** Original keys that failed to encrypt or save, in submission order. */
  failed: string[];
  /** Per-key failure detail, in the same order as `failed`. */
  failures: BulkSaveFailure[];
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export interface BulkSaveOptions {
  /**
   * Non-secret id for this logical operation, retained across retries so a
   * retried batch reuses its idempotency key instead of duplicating rows.
   */
  operationId: string;
  /** Target vault id, used only as an idempotency-key component here. */
  vaultId: string;
  encrypt: (data: Record<string, unknown>) => Promise<EncryptedEnvelope>;
  submit: (args: {
    items: Array<{ itemType: string } & EncryptedEnvelope>;
    idempotencyKey: string;
  }) => Promise<{ created: number } | undefined>;
  onProgress?: (progress: BulkSaveProgress) => void;
}

/**
 * Build a batch idempotency key from non-secret identifiers only: the caller's
 * operation id, the vault id, and the batch index. No item content, title, or
 * duplicate fingerprint ever contributes to a key.
 */
export function buildBulkIdempotencyKey(
  operationId: string,
  vaultId: string,
  batchIndex: number,
): string {
  return `bulk-import:${operationId}:${vaultId}:${batchIndex}`;
}

/** Throw if an operation id is not a non-secret, key-safe token. */
export function assertValidOperationId(operationId: string): void {
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    throw new Error("Invalid bulk operation id");
  }
}

/**
 * Encrypt and save `items` in sequential groups of {@link BULK_BATCH_SIZE}.
 *
 * Within a group every item is encrypted in parallel; across groups the work
 * is strictly sequential so the server sees a bounded number of concurrent
 * writes. Only server-confirmed rows are counted as saved.
 */
export async function saveEncryptedBatches(
  items: BulkSaveEntry[],
  {
    operationId,
    vaultId,
    encrypt,
    submit,
    onProgress,
  }: BulkSaveOptions,
): Promise<BulkSaveResult> {
  if (items.length === 0) return { saved: [], failed: [], failures: [] };
  assertValidOperationId(operationId);

  const saved: string[] = [];
  const failed: string[] = [];
  const failures: BulkSaveFailure[] = [];
  const fail = (
    key: string,
    batchIndex: number,
    stage: BulkSaveFailure["stage"],
    message: string,
  ) => {
    failed.push(key);
    failures.push({ key, batchIndex, stage, message });
  };

  // Group by the row's batch index: derived from position on a first run,
  // supplied by the caller on a retry.
  const groups = new Map<number, BulkSaveEntry[]>();
  items.forEach((entry, position) => {
    const index = entry.batchIndex ?? Math.floor(position / BULK_BATCH_SIZE);
    const group = groups.get(index) ?? [];
    group.push(entry);
    groups.set(index, group);
  });
  const orderedIndexes = [...groups.keys()].sort((a, b) => a - b);
  const batches = orderedIndexes.length;

  let batchesDone = 0;
  for (const batchIndex of orderedIndexes) {
    const batch = groups.get(batchIndex)!;
    batchesDone++;

    const encrypted = await Promise.all(
      batch.map(async (entry) => {
        try {
          const envelope = await encrypt(entry.data);
          return {
            key: entry.key,
            payload: { itemType: entry.itemType, ...envelope },
            message: "",
          };
        } catch (err) {
          return {
            key: entry.key,
            payload: null,
            message: errorMessage(err, "Encryption failed"),
          };
        }
      }),
    );

    const valid: Array<{
      key: string;
      payload: { itemType: string } & EncryptedEnvelope;
    }> = [];
    for (const entry of encrypted) {
      if (entry.payload) valid.push({ key: entry.key, payload: entry.payload });
      else fail(entry.key, batchIndex, "encrypt", entry.message);
    }

    if (valid.length > 0) {
      try {
        const response = await submit({
          items: valid.map((entry) => entry.payload),
          idempotencyKey: buildBulkIdempotencyKey(
            operationId,
            vaultId,
            batchIndex,
          ),
        });
        const created = Math.max(
          0,
          Math.min(response?.created ?? 0, valid.length),
        );
        for (let i = 0; i < valid.length; i++) {
          if (i < created) saved.push(valid[i]!.key);
          else fail(valid[i]!.key, batchIndex, "save", "Save failed");
        }
      } catch (err) {
        const message = errorMessage(err, "Save failed");
        for (const entry of valid) fail(entry.key, batchIndex, "save", message);
      }
    }

    onProgress?.({
      saved: saved.length,
      total: items.length,
      batch: batchesDone,
      batches,
    });
  }

  return { saved, failed, failures };
}
