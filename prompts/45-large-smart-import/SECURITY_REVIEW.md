# Security Review — Large Smart Import

Scope: the working-tree diff against commit `305258a` implementing bounded local
parsing, encrypted idempotent batch persistence, and the paginated Smart add
review step.

Method: read-only source audit of every changed and added file, plus targeted
verification through the local test suites listed under **Evidence**. No
external audit was performed and none is claimed. All fixtures referenced here
are synthetic values generated inside the tests.

**Verdict: pass.** No critical or high finding remains open. Three findings
(one medium, two low) were raised during the review and fixed in this change;
three informational notes are recorded below.

## 1. Required proofs

### 1.1 Plaintext import data stays in client memory before encryption

| Claim | Evidence |
| --- | --- |
| The parser performs no I/O | `client/src/services/import/smart-parse.ts` imports only `@/types/import`, `@/services/totp-engine`, `./csv-utils`, and `./parsers`. Asserted statically and at runtime in `smart-parse.test.ts` ("has no network, tRPC, AI SDK, logging, or analytics reference in its source", "imports only local parsing modules", "does not call fetch while parsing 300 records"). |
| Plaintext reaches only the encrypt callback | `client/src/services/import/bulk-save.ts:173-190` passes `entry.data` to `encrypt` and nothing else; `submit` receives `valid.map(entry => entry.payload)`, which is `{ itemType, ...envelope }`. |
| Encryption uses the existing helpers, unmodified | `pipeline.ts:142` `vaultCrypto.encryptItem`; `useVaultItems.ts:647-650` `vaultCrypto.encryptItemWithKey` / the injected `encryptItem`. No new primitive, no new key derivation, no new format. |
| Nothing plaintext is queued for offline work | `useVaultItems.ts` returns `allFailed("Vault is offline")` instead of enqueuing; asserted by "never queues plaintext when the vault is offline". |
| Request bodies carry no source text | `smart-add-300.test.tsx` "sends ciphertext envelopes with no source plaintext in any request body" asserts the exact key set of every item and every input, then asserts the serialized bodies contain none of the synthetic titles, usernames, passwords, URLs, or notes, and none of the field names. |

### 1.2 Server schemas accept only ciphertext envelopes and non-secret identifiers

`credentials.batchCreate` (`credentials.ts:190-247`) and
`sharedVault.batchAddItems` (`shared-vault.ts:1158-1220`) both use `.strict()`
on the outer object **and** on each item, so any extra key is rejected rather
than stripped. Each item is `{ itemType } & encryptedItemFields`. The only other
inputs are `vaultId`, the optional `organizationId`, and the optional
`idempotencyKey`.

Evidence: `import-surface.test.ts` "accepts only ciphertext envelopes and
non-secret ids on both batches" drives each schema with fourteen forbidden keys
(`title`, `username`, `password`, `url`, `uri`, `notes`, `note`, `totp`,
`secret`, `data`, `plaintext`, `content`, `text`, `prompt`) at both the batch
and item level and requires every one to throw. `credentials.test.ts` and
`shared-vault.test.ts` repeat the check through the routers themselves and
assert no insert is attempted.

### 1.3 Ownership, organization scope, and shared edit permission are rechecked

- `credentials.batchCreate` calls `verifyVaultOwnership(db, vaultId, ctx.user.id, resolveOrganizationId(...), t)` **before** the idempotency wrapper, so a replayed key cannot bypass the ownership check (`credentials.ts:215-222`).
- `sharedVault.batchAddItems` calls `requireVaultPermission(db, ctx.user.id, vaultId, "edit", t)` once, before the insert (`shared-vault.ts:1187-1193`). Non-members and `view` members get `FORBIDDEN`.
- Rows are written with `sharedVaultId: input.vaultId` and `createdBy: ctx.user.id`; neither is caller-supplied. Asserted by "scopes rows to the caller even when another user id is supplied", which also pins the exact written column set.
- Ordering matters and is pinned: "checks edit permission once, before a single multi-row insert".

### 1.4 Idempotency keys are not secret-derived

`buildBulkIdempotencyKey(operationId, vaultId, batchIndex)`
(`bulk-save.ts:108-114`) is the only key constructor. No item content, title,
field, or duplicate fingerprint is an input. `assertValidOperationId` restricts
the operation id to `^[A-Za-z0-9_-]{1,64}$` and throws **before** any encryption
runs, so a caller cannot smuggle a secret into a key that the server persists.
`newImportOperationId()` derives the id from `crypto.randomUUID()`.

Evidence: `bulk-save.test.ts` "derives keys only from operation, vault, and
batch index", "produces a key the server's format guard accepts", "rejects a
secret-shaped operation id before encrypting anything";
`useVaultItems-bulk.test.tsx` "rejects an operation id that could carry a
secret".

### 1.5 No secret reaches logs, analytics, errors, ARIA labels, test ids, or metadata

- No `console.*`, `gtag`, or `sendBeacon` appears in `smart-parse.ts`, `bulk-save.ts`, `useImportPipeline.ts`, or `ImportWizard.tsx` (verified by grep and by the static purity test).
- Parser warnings carry a code, a line number, an item index, and — for `unmappedFields` — **label names only**, truncated to 40 characters and capped at 8 per block (`smart-parse.ts:MAX_REPORTED_FIELD_NAME_LENGTH`). Values are never included: "reports unmapped non-empty labels by name and drops their values" asserts the dropped value is absent from the result, and "drops an unusable TOTP value and warns without echoing it" asserts the rejected secret is absent from the warnings.
- Parse errors carry a code plus numeric bounds only (`SmartParseError`), translated at the component boundary (`ImportWizard.tsx` `parseErrorKey`).
- Accessible names identify rows by ordinal (`"Select item {{row}}"`, `"Title for item {{row}}"`). Asserted by "keeps every control at least 44px and free of item content", which scans every `aria-label` and every `data-testid` for item content.
- The server persists only `{ created: number }` as the idempotency response body (`bulk-save` submit contract; `credentials.ts:246`, `shared-vault.ts:1219`).

### 1.6 No plaintext parse route or provider configuration exists

Whole-repo search for `aiImport|ai_import|bulk-item-extractor|openai|anthropic|@ai-sdk|ai_import_trial` returns only this review, `ROOT_CAUSE.md`, and the
negative assertions inside the tests — no runtime consumer. `import-surface.test.ts`
pins this: no router name containing "ai", no procedure on any router matching
`parse|extract|analyze|analyse`, and a bulk item write present on both vault
kinds. There is no provider env var, model id, quota, or trial table to remove;
see `ROOT_CAUSE.md` §1.

### 1.7 Crypto is unchanged

No file under `crypto/` is modified. `vault-crypto.ts` is untouched. The diff
adds no cipher, KDF, encoding, or key-handling code. `.pssmngr` bundles are
explicitly refused by the parser and routed to the existing Import/Export
backup flow that owns password handling (`checkImportFile` →
`encryptedBundle`).

## 2. Findings

### F-1 — Medium — Retried batch could reuse another batch's idempotency key *(fixed in this change)*

**Impact.** The first design re-batched the failed rows on retry, so a retry of
50 failed rows was submitted under key `…:0`. If batch 0 had already committed,
the server would replay batch 0's stored `{ created: 50 }` and the retried rows
would be silently dropped — the user would be told 300 items saved while 50 were
never written. With the reverse timing it could instead have inserted a
different item set under a key that no longer described it.

**Remediation.** Batch identity is now a property of the row, not of its
position in the retry array. `BulkSaveEntry.batchIndex` is derived from position
on a first run and supplied by the caller on a retry
(`bulk-save.ts:156-171`); `BulkSaveFailure.batchIndex` reports it back, and
`useImportPipeline.confirmImport` stores it on each retained row and passes it
through `executeImport`'s `batchIndexes`. A retried batch therefore resubmits
the same item set under the same key, which is what makes the server-side replay
correct.

**Regression coverage.** `smart-add-300.test.tsx` "retries only the failed
middle batch and reuses its idempotency key" forces batch 2 to fail across a
300-record run, then asserts the retry issues exactly one mutation of 50 items
under the original `…:2` key and does not resend the batches that succeeded.
`bulk-save.test.ts` "honours caller-supplied batch indexes on a retry" and
"records the batch index on every failure so a retry can reuse it" pin the unit
behaviour; `useImportPipeline.test.ts` "reuses the operation id and original
batch index when retrying" pins the hook wiring.

### F-2 — Low — Pasted plaintext was retained in the textarea during review *(fixed in this change)*

**Impact.** After a successful paste-and-review, the full pasted export
remained in the component's `pasteValue` state as well as in the preview rows,
doubling the in-memory copies and leaving one of them in a rendered DOM node
value for the whole review step.

**Remediation.** `ImportWizard.tsx` clears `pasteValue` at the moment the
content is handed to the parser, so review holds one copy.

**Regression coverage.** `ImportWizard.test.tsx` "parses pasted text through the
local parser" now asserts the textarea is empty after analysis.

### F-3 — Low — `credentials.batchCreate` silently accepted plaintext item keys *(fixed in this change)*

**Impact.** The pre-existing per-item schema was not `.strict()`
(`credentials.ts:190` before this change), so an item carrying `title` or
`password` alongside its envelope was accepted and the extra keys were stripped
rather than rejected. Nothing was stored, but the contract did not fail closed:
a buggy or malicious client got a success response for a request that contained
plaintext, and the server had no signal that plaintext had been sent.

**Remediation.** The item schema is now `.strict()`, matching the new
`sharedVault.batchAddItems` contract.

**Regression coverage.** `credentials.test.ts` "rejects plaintext fields on the
batch input" and `import-surface.test.ts` cover both levels for both procedures.

### F-4 — Informational — `ImportSummary.errors[].title` holds plaintext in client memory

The pre-existing `ImportItemError` shape carries the failed item's title. It is
client-only: nothing logs it, transmits it, or renders it — the summary step
shows counts and a retry control, not error titles — and it is discarded by
`reset()` / `back()`. No change made; recorded so a future edit does not start
rendering or reporting it.

### F-5 — Informational — Cross-user idempotency-key collision degrades to a re-execute

`runWithIdempotency` reads scoped by `(key, userId, router, procedure)` but
writes with `onConflictDoNothing({ target: key })`. If two users ever chose the
same key, the second user would not read the first user's response (correct — no
cross-user leak) but would fail to persist their own, so their retry would
re-execute. This is pre-existing shared-helper behaviour, applies equally to
`credentials.create`, and is unreachable in practice because operation ids come
from `crypto.randomUUID()`. Not introduced by this change; no fix made.

### F-6 — Informational — The duplicate fingerprint is plaintext-derived by construction

`exactItemFingerprint` (`client/src/services/vault-duplicates.ts`) returns a
canonical JSON rendering of the item, so it is exactly as sensitive as the item.
It is computed inside a `useMemo`, compared against a local `Set` that goes out
of scope immediately, and only **row keys** are retained in state. The function
is documented as ephemeral and must never be logged, persisted, transmitted,
placed in a test id or ARIA label, or used to derive an idempotency key — all of
which are enforced by the assertions in §1.4 and §1.5.

## 3. Evidence index

Local test commands run for this review, all green:

| Command | Result |
| --- | --- |
| `cd client && npx vitest run src/services/import` | parser, bulk-save, and pipeline suites pass |
| `cd client && npx vitest run src/hooks/__tests__/useImportPipeline.test.ts` | 20 passed |
| `cd client && npx vitest run src/components/import-export` | 43 passed, including the 300-record regression |
| `cd client && npx vitest run src/components/vault/page` | vault hook suites pass, including 15 bulk-create tests |
| `cd pssmngr-server/apps/pssmngr && FEATURE_FLAG_PAYMENTS=true npx vitest@2.1.9 run --config __test__/vitest.config.ts` | 77 files, 2491 tests passed |
| `make test` | crypto, client (8 shards), and server suites pass |
| `make typecheck` | clean |
| `make lint` | clean |
| `git diff --check` | clean |

`FEATURE_FLAG_PAYMENTS=true` was set as the prompt specified. It has no effect
on this checkout: the repository has no payments feature and no runtime feature
flags (`AGENTS.md` rule 7), so the variable is inert.
