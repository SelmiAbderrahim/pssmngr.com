# Vault page composition

The vault route (`routes/_app/_auth/dashboard/vault.tsx`) is intentionally
thin: it is a wiring shell around the focused pieces in this folder.

## Composition map

```
vault.tsx (route)                — validateSearch, ActiveDialog state, composition
│
├─ VaultHeader                   — title, last-synced label, "Add Item" (+ "Scan QR" on authenticators tab)
├─ OrgVaultBanner                — non-personal workspace: resolve error / setup / pending / grant
├─ VaultTabsBar                  — items | authenticators | sharing | trash (with trash count badge)
├─ VaultBody                     — switches to the right tab component
│   ├─ ItemsTab                  — search toolbar, filter/sort, list, detail split
│   ├─ AuthenticatorsTab         — TOTP list + detail split
│   ├─ SharingTab → SharingCenter (../SharingCenter.tsx)
│   └─ TrashTab   → TrashView    (../TrashView.tsx)
├─ VaultLockedCard / NoVaultCard — the two non-loading empty states
└─ VaultDialogs                  — pure switch over ActiveDialog (see below)
```

Data lives in `useVaultItems` (server + decrypted items, favorites, load-more,
auto-purge + trash count, offline queueing). The route's own state is only:
- `dialog: ActiveDialog`
- `dismissedPrompt`, `decryptionFailed`
- `selectedItemId`, `searchInput`
- `orgVault` (via `useOrgSharedVault`) and its setup handlers
  (via `useOrgSharedVaultActions`)

## `ActiveDialog` state machine

One discriminated union — see `types.ts` — replaces every dialog boolean
that used to live in the route:

```ts
type ActiveDialog =
  | { kind: "none" }
  | { kind: "createItem"; itemType?: CreateType }
  | { kind: "qrScanner" }
  | { kind: "totpPreview"; uri: OTPAuthURI }
  | { kind: "share"; itemId: string }   // ShareFlow: person or link
  | { kind: "unlock" };                 // MasterPasswordPrompt
```

Because only one variant can be set at a time, opening one dialog closes any
other by construction. `VaultDialogs.tsx` is a pure switch over the union.

## `vaultMode` branching

Every component takes the current mode as explicit props — never re-derives
it. The route computes:

| Prop                    | Meaning                                                   |
| ----------------------- | --------------------------------------------------------- |
| `sharedAccess`          | `OrgVaultAccess` when `orgVault.kind === "ready"` else `null` |
| `canMutateItems`        | shared vaults require `edit` permission or higher         |
| `canUsePersonalSharing` | `!sharedAccess` — person/link shares only on personal items |
| `usesPerUserVault`      | `isPersonalWorkspace || orgVault.kind === "none"`         |
| `isOrgPending`          | non-personal workspace waiting for admin to grant access  |

Children (ItemsTab, AuthenticatorsTab, VaultDialogs, …) receive these as
props and never look at `orgVault` themselves.

## ShareFlow modes → server endpoints

`ShareFlow.tsx` shows a mode picker with two options, each backed by a
distinct server surface:

| Mode     | Component            | Server                                              |
| -------- | -------------------- | --------------------------------------------------- |
| `person` | `SharePersonStep`    | `sharing.shareItem` (persistent key-wrapping)       |
| `link`   | `ShareLinkStep`      | `sharing.createEphemeralLink` (URL fragment holds key) |

For link mode the decryption key stays in the URL `#fragment` — no
transport call ever carries it (asserted by `__tests__/ShareFlow.test.tsx`).

## Sharing inbox

`SharingCenter.tsx` merges the former `PendingSharesInbox` +
`SentSharesList` into a single Received/Sent view sharing one refresh
signal (the `pssmngr:shares-changed` window event).
