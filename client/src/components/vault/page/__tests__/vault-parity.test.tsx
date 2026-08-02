// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Vault behavior-parity regression suite.
 *
 * These fixtures and assertions are locked against the current behavior of
 * the extracted pieces
 * (ItemsTab / useFilteredItems / useVaultItems / TrashView /
 * AuthenticatorsTab / OrgVaultBanner). Treat any failure here as a behavior
 * regression, not a style nit — update expectations only for intentional
 * behavior changes.
 *
 * Covers:
 * 1. A ≥12-item fixture spanning every ItemType (login, passkey, identity,
 *    card, note, totp, file — the full union in vaultItemDisplay.ts),
 *    with ≥2 favorites, ≥2 trashed items and a TOTP-bearing item.
 * 2. Rendered list order + per-type visible fields in ItemsTab.
 * 3. Search filtering (3 distinct queries) via useFilteredItems.
 * 4. Favorite toggle → trpcMutation("credentials", "toggleFavorite", ...).
 * 5. Trash/restore round-trip → "softDelete" and "restore" mutations.
 * 6. Authenticators tab TOTP rendering under fake timers.
 * 7. Org-shared-vault setup prompt (OrgVaultBanner, kind: "none").
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  renderHook,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import type {
  DecryptedVaultItem,
  ItemType,
} from "@/components/vault/VaultItemCard";
import type { FilterType, SortOption } from "../utils";

// ── Mocks (repo idiom: vi.hoisted + vi.mock of @/lib/api/trpc) ───────

const { mockTrpcQuery, mockTrpcMutation } = vi.hoisted(() => ({
  mockTrpcQuery: vi.fn(),
  mockTrpcMutation: vi.fn(),
}));

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: mockTrpcQuery,
  trpcMutation: mockTrpcMutation,
}));

const vaultCryptoMock = vi.hoisted(() => ({
  decryptServerItem: vi.fn(),
  decryptItemWithKey: vi.fn(),
  encryptItemWithKey: vi.fn(),
  createVerificationBlob: vi.fn(async () => "verification-blob"),
  lock: vi.fn(),
}));

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: vaultCryptoMock,
}));

vi.mock("@/sync/offlineQueue", () => ({
  enqueue: vi.fn(),
}));

vi.mock("@/sync/useOfflineMutation", () => ({
  buildVaultItemIdempotencyKey: vi.fn(() => "idem-key"),
}));

vi.mock("@/lib/clipboard", () => ({
  copySensitiveText: vi.fn(() => Promise.resolve()),
}));

// Heavy children stubbed out (VaultDialogs.test idiom).
vi.mock("@/components/vault/ItemDetailView", () => ({
  ItemDetailView: () => <div data-testid="detail-view" />,
}));
vi.mock("@/components/security/ProtectionExplainer", () => ({
  ProtectionExplainer: () => <div data-testid="protection-explainer" />,
}));

// TOTP engine mocked so codes are deterministic; rotation timing is still
// driven by the real 1s interval in TOTPCodeCard (exercised with fake timers).
const totpEngine = vi.hoisted(() => ({
  generateTOTP: vi.fn(async () => "123456"),
  base32Decode: vi.fn(() => new Uint8Array(20)),
  getRemainingSeconds: vi.fn(() => 17),
}));
vi.mock("@/services/totp-engine", () => totpEngine);

// Imports after mocks
import { ItemsTab } from "../ItemsTab";
import { useFilteredItems } from "../useFilteredItems";
import { useVaultItems } from "../useVaultItems";
import { AuthenticatorsTab } from "../AuthenticatorsTab";
import { TOTPListView } from "@/components/vault/TOTPListView";
import { OrgVaultBanner } from "../OrgVaultBanner";
import { TrashView } from "@/components/vault/TrashView";

// ── 1. Fixture: every ItemType, ≥12 items, ≥2 favorites, ≥2 trashed ──

/** makeItem factory — idiom copied from VaultItemCard.test.tsx. */
function makeItem(
  overrides: Partial<DecryptedVaultItem> = {},
): DecryptedVaultItem {
  return {
    id: "item-1",
    itemType: "login",
    isFavorite: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    decrypted: { title: "My Login", username: "admin" },
    ...overrides,
  };
}

/** ids of fixture items that live in the trash (soft-deleted). */
const TRASHED_IDS = new Set(["trashed-login", "trashed-note"]);

const fixture: DecryptedVaultItem[] = [
  makeItem({
    id: "login-github",
    itemType: "login",
    isFavorite: true,
    updatedAt: "2026-06-10T00:00:00Z",
    decrypted: { title: "GitHub", username: "octocat" },
  }),
  makeItem({
    id: "login-bank",
    itemType: "login",
    updatedAt: "2026-06-18T00:00:00Z",
    decrypted: {
      title: "Acme Bank",
      username: "alice.b",
      email: "alice@bank.example",
    },
  }),
  makeItem({
    id: "card-visa",
    itemType: "card",
    isFavorite: true,
    updatedAt: "2026-06-20T00:00:00Z",
    decrypted: { title: "Visa Platinum", number: "4111111111111234" },
  }),
  makeItem({
    id: "card-amex",
    itemType: "card",
    updatedAt: "2026-06-05T00:00:00Z",
    decrypted: { title: "Amex Corporate", number: "378282246310005" },
  }),
  makeItem({
    id: "note-wifi",
    itemType: "note",
    updatedAt: "2026-06-15T00:00:00Z",
    decrypted: { title: "Office WiFi", content: "WiFi key for the office router" },
  }),
  makeItem({
    id: "note-recovery",
    itemType: "note",
    updatedAt: "2026-06-01T00:00:00Z",
    decrypted: { title: "Recovery Codes", content: "backup recovery codes" },
  }),
  makeItem({
    id: "identity-passport",
    itemType: "identity",
    updatedAt: "2026-06-12T00:00:00Z",
    decrypted: {
      title: "Passport",
      email: "alice@example.com",
      fullName: "Alice Smith",
    },
  }),
  makeItem({
    id: "totp-github",
    itemType: "totp",
    updatedAt: "2026-06-19T00:00:00Z",
    decrypted: {
      title: "GitHub 2FA",
      issuer: "GitHub",
      account: "octocat@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    },
  }),
  makeItem({
    id: "passkey-google",
    itemType: "passkey",
    updatedAt: "2026-06-08T00:00:00Z",
    decrypted: { title: "Google Passkey", rpId: "google.com" },
  }),
  makeItem({
    id: "file-taxes",
    itemType: "file",
    updatedAt: "2026-06-03T00:00:00Z",
    decrypted: { title: "taxes-2025.pdf" },
  }),
  // Soft-deleted items: NOT part of the live list (trash is a separate
  // server-side listing) — used by the TrashView round-trip below.
  makeItem({
    id: "trashed-login",
    itemType: "login",
    updatedAt: "2026-05-20T00:00:00Z",
    decrypted: { title: "Old Forum", username: "ghost" },
  }),
  makeItem({
    id: "trashed-note",
    itemType: "note",
    updatedAt: "2026-05-10T00:00:00Z",
    decrypted: { title: "Old Note", content: "stale" },
  }),
];

const liveItems = fixture.filter((i) => !TRASHED_IDS.has(i.id));
const trashedItems = fixture.filter((i) => TRASHED_IDS.has(i.id));

/** Server-record shape for the trashed fixture items (TrashView input). */
function toTrashServerItem(item: DecryptedVaultItem, deletedDaysAgo = 5) {
  return {
    id: item.id,
    vaultId: "vault-1",
    itemType: item.itemType,
    ciphertext: "ct",
    nonce: "n",
    authTag: "at",
    wrappedDataKey: "wdk",
    wrappedDataKeyNonce: "wdkn",
    wrappedDataKeyAuthTag: "wdkat",
    version: 1,
    isFavorite: item.isFavorite,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: new Date(
      Date.now() - deletedDaysAgo * 24 * 60 * 60 * 1000,
    ).toISOString(),
  };
}

const noop = () => {};
const noopAsync = async () => {};

/** Renders ItemsTab fed by the real useFilteredItems hook (parity path). */
function ItemsTabHarness({
  items = liveItems,
  q = "",
  filter = "all" as FilterType,
  sort = "modified" as SortOption,
  onToggleFavorite = noop as (id: string) => void,
}: {
  items?: DecryptedVaultItem[];
  q?: string;
  filter?: FilterType;
  sort?: SortOption;
  onToggleFavorite?: (id: string) => void;
}) {
  const filtered = useFilteredItems({
    decryptedItems: items,
    filter,
    sort,
    q,
    searchIndexReady: false,
    searchIndex: () => [],
  });
  return (
    <ItemsTab
      filteredItems={filtered}
      decryptedItems={items}
      selectedItem={null}
      viewMode="grid"
      searchInput={q}
      onSearchInputChange={noop}
      filter={filter}
      sort={sort}
      onFilterChange={noop}
      onSortChange={noop}
      isLoading={false}
      itemsLoading={false}
      decrypting={false}
      hasItems={items.length > 0}
      hasFilteredItems={filtered.length > 0}
      isOrgPending={false}
      canMutateItems
      canUsePersonalSharing
      sharedAccess={false}
      nextCursor={undefined}
      loadingMore={false}
      favoriteLoadingId={null}
      onLoadMore={noop}
      onSelectItem={noop}
      onCloseDetail={noop}
      onToggleFavorite={onToggleFavorite}
      onSaveItem={noopAsync}
      onDeleteItem={noopAsync}
      onShareClick={noop}
      onAddClick={noop}
    />
  );
}

/** Titles of rendered cards, in DOM order (VaultItemCard title node). */
function renderedTitles(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll("p.text-sm.font-medium"),
  ).map((el) => el.textContent ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTrpcMutation.mockResolvedValue(undefined);
});

// ── Fixture invariants ───────────────────────────────────────────────

describe("parity fixture invariants", () => {
  it("covers every supported itemType with ≥12 items, ≥2 favorites, ≥2 trashed, ≥1 TOTP", () => {
    const allTypes: ItemType[] = [
      "login",
      "passkey",
      "identity",
      "card",
      "note",
      "totp",
      "file",
    ];
    const typesInFixture = new Set(fixture.map((i) => i.itemType));
    for (const t of allTypes) expect(typesInFixture.has(t)).toBe(true);
    expect(fixture.length).toBeGreaterThanOrEqual(12);
    expect(fixture.filter((i) => i.isFavorite).length).toBeGreaterThanOrEqual(2);
    expect(trashedItems.length).toBeGreaterThanOrEqual(2);
    expect(fixture.some((i) => i.itemType === "totp")).toBe(true);
  });
});

// ── 2. Rendered list order + visible fields per item type ────────────

describe("ItemsTab rendered list (parity)", () => {
  it("renders favorites first, then updatedAt-descending (default modified sort)", () => {
    const { container } = render(<ItemsTabHarness />);
    expect(renderedTitles(container)).toEqual([
      // favorites (by modified desc among themselves)
      "Visa Platinum",
      "GitHub",
      // non-favorites by modified desc
      "GitHub 2FA",
      "Acme Bank",
      "Office WiFi",
      "Passport",
      "Google Passkey",
      "Amex Corporate",
      "taxes-2025.pdf",
      "Recovery Codes",
    ]);
  });

  it("shows the type-specific subtitle for each item type", () => {
    render(<ItemsTabHarness />);
    // login → username
    expect(screen.getByText("octocat")).toBeInTheDocument();
    expect(screen.getByText("alice.b")).toBeInTheDocument();
    // card → masked last-4
    expect(screen.getByText("**** 1234")).toBeInTheDocument();
    expect(screen.getByText("**** 0005")).toBeInTheDocument();
    // identity → email preferred over fullName
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    // totp → issuer ("GitHub" also appears as the login title)
    expect(screen.getAllByText("GitHub").length).toBe(2);
    // passkey → rpId
    expect(screen.getByText("google.com")).toBeInTheDocument();
    // note → content excerpt
    expect(
      screen.getByText("WiFi key for the office router"),
    ).toBeInTheDocument();
  });

  it("renders no subtitle for file items", () => {
    render(<ItemsTabHarness />);
    const title = screen.getByText("taxes-2025.pdf");
    expect(
      title.parentElement?.querySelector("p.text-xs"),
    ).toBeNull();
  });

  it("shows the empty state with add-first-item CTA when the vault has no items", () => {
    render(<ItemsTabHarness items={[]} />);
    expect(screen.getByTestId("vault-empty-state")).toBeInTheDocument();
    expect(screen.getByText("vault.empty")).toBeInTheDocument();
    expect(screen.getByText("vault.addFirstItem")).toBeInTheDocument();
    expect(screen.getByTestId("protection-explainer")).toBeInTheDocument();
  });

  it("shows the no-results state when a search matches nothing", () => {
    render(<ItemsTabHarness q="zzz-no-such-item" />);
    expect(screen.getByText("vault.noResults")).toBeInTheDocument();
    expect(screen.queryByTestId("vault-empty-state")).not.toBeInTheDocument();
  });

  it("forwards star clicks as onToggleFavorite(itemId) (prop contract)", () => {
    const onToggleFavorite = vi.fn();
    render(<ItemsTabHarness onToggleFavorite={onToggleFavorite} />);
    // First rendered card is the favorite "Visa Platinum" → unfavorite label
    const unfavButtons = screen.getAllByLabelText("vault.unfavorite");
    fireEvent.click(unfavButtons[0]!);
    expect(onToggleFavorite).toHaveBeenCalledWith("card-visa");
    // A non-favorite card exposes the favorite label
    const favButtons = screen.getAllByLabelText("vault.favorite");
    fireEvent.click(favButtons[0]!);
    expect(onToggleFavorite).toHaveBeenCalledWith("totp-github");
  });
});

// ── 3. Search filter (useFilteredItems) — 3 distinct queries ─────────

describe("useFilteredItems search parity", () => {
  function search(q: string, filter: FilterType = "all") {
    const { result } = renderHook(() =>
      useFilteredItems({
        decryptedItems: liveItems,
        filter,
        sort: "name",
        q,
        searchIndexReady: false,
        searchIndex: () => [],
      }),
    );
    return result.current.map((i) => i.id).sort();
  }

  it('query "octocat" matches only the login username (totp account is NOT searched)', () => {
    expect(search("octocat")).toEqual(["login-github"]);
  });

  it('query "github" matches titles across item types', () => {
    expect(search("github")).toEqual(["login-github", "totp-github"]);
  });

  it('query "alice" matches username, email and identity fullName', () => {
    expect(search("alice")).toEqual(["identity-passport", "login-bank"]);
  });

  it("type filter composes with search", () => {
    expect(search("alice", "identity")).toEqual(["identity-passport"]);
  });
});

// ── 4 & 5. Mutations: toggleFavorite / softDelete (useVaultItems) ────

describe("useVaultItems mutations (parity)", () => {
  function setupTrpcQueries() {
    mockTrpcQuery.mockImplementation(
      async (router: string, procedure: string) => {
        if (router === "vault" && procedure === "list") {
          return [
            {
              id: "vault-1",
              name: "Personal",
              kdfSalt: "salt",
              encryptedVerificationBlob: "blob", // set → no backfill mutation
            },
          ];
        }
        if (router === "credentials" && procedure === "list") {
          return { items: [], nextCursor: undefined };
        }
        if (router === "credentials" && procedure === "listTrash") {
          return { items: [], nextCursor: undefined };
        }
        return null;
      },
    );
  }

  // IMPORTANT: these must be render-stable — several useVaultItems effects
  // list them as dependencies; fresh fns per render would loop the effects.
  const stableArgs = {
    userId: "user-1",
    activeWorkspaceId: null,
    isUnlocked: true,
    isPersonalWorkspace: true,
    orgVault: null,
    sharedAccess: null,
    canMutateItems: true,
    vaultIsOnline: true,
    encryptItem: async () => ({
      ciphertext: "ct",
      nonce: "n",
      authTag: "at",
      wrappedDataKey: "wdk",
      wrappedDataKeyNonce: "wdkn",
      wrappedDataKeyAuthTag: "wdkat",
    }),
    loadOrBuildIndex: vi.fn(),
    indexAddItem: vi.fn(),
    indexRemoveItem: vi.fn(),
    indexUpdateItem: vi.fn(),
    onBulkDecryptFailure: vi.fn(),
  };

  function renderVaultItemsHook() {
    return renderHook(() => useVaultItems(stableArgs));
  }

  it('toggleFavorite calls trpcMutation("credentials", "toggleFavorite", { itemId })', async () => {
    setupTrpcQueries();
    const { result } = renderVaultItemsHook();
    await waitFor(() => expect(result.current.vault?.id).toBe("vault-1"));

    await act(async () => {
      await result.current.handleToggleFavorite("item-42");
    });

    expect(mockTrpcMutation).toHaveBeenCalledWith(
      "credentials",
      "toggleFavorite",
      { itemId: "item-42" },
    );
    expect(result.current.favoriteLoadingId).toBeNull();
  });

  it('delete calls trpcMutation("credentials", "softDelete", { itemId }) and bumps trashCount; restore refetches and decrements', async () => {
    setupTrpcQueries();
    const { result } = renderVaultItemsHook();
    await waitFor(() => expect(result.current.vault?.id).toBe("vault-1"));
    await waitFor(() => expect(result.current.itemsLoading).toBe(false));
    expect(result.current.trashCount).toBe(0);

    await act(async () => {
      await result.current.handleDeleteItem("item-42");
    });

    expect(mockTrpcMutation).toHaveBeenCalledWith("credentials", "softDelete", {
      itemId: "item-42",
    });
    expect(result.current.trashCount).toBe(1);

    // Restore side: the hook refetches the live list and decrements the badge
    const listCallsBefore = mockTrpcQuery.mock.calls.filter(
      ([r, p]) => r === "credentials" && p === "list",
    ).length;
    await act(async () => {
      result.current.handleRestoreFromTrash();
    });
    expect(result.current.trashCount).toBe(0);
    await waitFor(() => {
      const listCallsAfter = mockTrpcQuery.mock.calls.filter(
        ([r, p]) => r === "credentials" && p === "list",
      ).length;
      expect(listCallsAfter).toBe(listCallsBefore + 1);
    });
  });
});

// ── 5b. Trash restore round-trip (TrashView) ─────────────────────────

describe("TrashView restore round-trip (parity)", () => {
  beforeEach(() => {
    const byId = new Map(fixture.map((i) => [i.id, i.decrypted]));
    vaultCryptoMock.decryptServerItem.mockImplementation(
      async (item: { id: string }) =>
        byId.get(item.id) ?? { title: `Decrypted-${item.id}` },
    );
    mockTrpcQuery.mockResolvedValue({
      items: trashedItems.map((i) => toTrashServerItem(i)),
      nextCursor: undefined,
    });
  });

  it("lists trashed fixture items (not shown in the live list)", async () => {
    render(<TrashView vaultId="vault-1" />);
    expect(await screen.findByText("Old Forum")).toBeInTheDocument();
    expect(screen.getByText("Old Note")).toBeInTheDocument();
    expect(mockTrpcQuery).toHaveBeenCalledWith("credentials", "listTrash", {
      vaultId: "vault-1",
      limit: 50,
    });
  });

  it('restore calls trpcMutation("credentials", "restore", { itemId }) and removes the row', async () => {
    const onRestoreItem = vi.fn();
    render(<TrashView vaultId="vault-1" onRestoreItem={onRestoreItem} />);
    await screen.findByText("Old Forum");

    // Rows render in fixture order: trashed-login first
    fireEvent.click(screen.getAllByLabelText("vault.restore")[0]!);

    await waitFor(() => {
      expect(mockTrpcMutation).toHaveBeenCalledWith("credentials", "restore", {
        itemId: "trashed-login",
      });
    });
    await waitFor(() => {
      expect(screen.queryByText("Old Forum")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Old Note")).toBeInTheDocument();
    expect(onRestoreItem).toHaveBeenCalled();
  });
});

// ── 6. Authenticators tab TOTP rendering (fake timers) ───────────────

describe("AuthenticatorsTab TOTP rendering (parity)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T12:00:00Z"));
    totpEngine.getRemainingSeconds.mockReturnValue(17);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderAuthTab() {
    return render(
      <AuthenticatorsTab
        decryptedItems={liveItems}
        selectedItem={null}
        favoriteLoadingId={null}
        canMutateItems
        canUsePersonalSharing
        sharedAccess={false}
        onSelectItem={noop}
        onCloseDetail={noop}
        onSaveItem={noopAsync}
        onDeleteItem={noopAsync}
        onToggleFavorite={noop}
        onShareClick={noop}
        onScanQR={noop}
      />,
    );
  }

  it("renders only TOTP items, with issuer, account, live code and countdown", async () => {
    renderAuthTab();
    // Flush the async generateTOTP microtask (fake timers stay in control)
    await act(async () => {
      await Promise.resolve();
    });

    // Only the single totp fixture item is shown
    expect(screen.getByText("GitHub")).toBeInTheDocument(); // issuer label
    expect(screen.getByText("octocat@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Visa Platinum")).not.toBeInTheDocument();
    expect(screen.queryByText("Acme Bank")).not.toBeInTheDocument();

    // Code is formatted with a thin space: "123 456"
    expect(screen.getByText("123 456")).toBeInTheDocument();
    // Countdown shows the mocked remaining seconds
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(totpEngine.generateTOTP).toHaveBeenCalledTimes(1);
  });

  it("regenerates the code only at the period boundary", async () => {
    renderAuthTab();
    await act(async () => {
      await Promise.resolve();
    });
    expect(totpEngine.generateTOTP).toHaveBeenCalledTimes(1);

    // Mid-period tick: no regeneration
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(totpEngine.generateTOTP).toHaveBeenCalledTimes(1);

    // Boundary tick (remaining === period): regenerate
    totpEngine.getRemainingSeconds.mockReturnValue(30);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(totpEngine.generateTOTP).toHaveBeenCalledTimes(2);
  });

  it("shows the empty authenticators state with a Scan QR CTA when no TOTP items exist", () => {
    const onScanQR = vi.fn();
    render(
      <TOTPListView
        items={liveItems.filter((i) => i.itemType !== "totp")}
        onSelect={noop}
        onScanQR={onScanQR}
      />,
    );
    expect(screen.getByText("totp.noAuthenticators")).toBeInTheDocument();
    fireEvent.click(screen.getByText("totp.scanQRCode"));
    expect(onScanQR).toHaveBeenCalled();
  });
});

// ── 7. Org-shared-vault setup prompt (OrgVaultBanner) ────────────────

describe("OrgVaultBanner org mode (parity)", () => {
  function renderBanner(
    orgVault: React.ComponentProps<typeof OrgVaultBanner>["orgVault"],
    overrides: Partial<React.ComponentProps<typeof OrgVaultBanner>> = {},
  ) {
    const onSetupSharedVault = vi.fn();
    const onRunOrgResolve = vi.fn();
    const utils = render(
      <OrgVaultBanner
        isPersonalWorkspace={false}
        isUnlocked
        orgVault={orgVault}
        orgResolveError={null}
        orgSetupBusy={false}
        orgGrantMessage={null}
        onRunOrgResolve={onRunOrgResolve}
        onSetupSharedVault={onSetupSharedVault}
        onGrantPendingMembers={noop}
        {...overrides}
      />,
    );
    return { ...utils, onSetupSharedVault, onRunOrgResolve };
  }

  it('renders the setup card for orgVault={kind:"none"} when the user can manage', () => {
    const { onSetupSharedVault } = renderBanner({
      kind: "none",
      canManage: true,
    });
    expect(screen.getByText("vault.org.setupTitle")).toBeInTheDocument();
    expect(screen.getByText("vault.org.setupDesc")).toBeInTheDocument();
    fireEvent.click(screen.getByText("vault.org.setupButton"));
    expect(onSetupSharedVault).toHaveBeenCalled();
  });

  it("renders the member notice (no setup card) when the user cannot manage", () => {
    renderBanner({ kind: "none", canManage: false });
    expect(screen.getByText("vault.org.noneMember")).toBeInTheDocument();
    expect(screen.queryByText("vault.org.setupTitle")).not.toBeInTheDocument();
    expect(screen.queryByText("vault.org.setupButton")).not.toBeInTheDocument();
  });

  it("renders the pending notice with a re-check action", () => {
    const { onRunOrgResolve } = renderBanner({ kind: "pending" });
    expect(screen.getByText("vault.org.pending")).toBeInTheDocument();
    fireEvent.click(screen.getByText("vault.org.checkAgain"));
    expect(onRunOrgResolve).toHaveBeenCalled();
  });

  it("renders nothing in a personal workspace", () => {
    const { container } = renderBanner(
      { kind: "none", canManage: true },
      { isPersonalWorkspace: true },
    );
    expect(container).toBeEmptyDOMElement();
  });
});
