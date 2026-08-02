// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Watchtower Background Scan Service
 *
 * Singleton that runs vault security analysis in the background:
 *  1. On vault unlock → load cached results (encrypted) for instant badge
 *  2. Run fresh scan → analyze weak/reused/old passwords
 *  3. Persist encrypted results to server via tRPC
 *  4. Re-scan every 24 hours while vault is unlocked
 *  5. On vault lock → clear all state
 *
 * Follows the same encrypted-blob persistence pattern as the search index.
 */

import { vaultCrypto, type ServerItemRecord } from "@/services/vault-crypto";
import { analyzeVault, type AnalysisResult } from "@/services/watchtower-analyzer";
import { trpcQuery, trpcMutation } from "@/lib/api/trpc";
import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";

// ── Constants ─────────────────────────────────────────────────────────

const RESCAN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SYNC_DEBOUNCE_MS = 2_000;

// ── Types ─────────────────────────────────────────────────────────────

export interface WatchtowerScanState {
  score: number;
  issueCount: number;
  counts: { weak: number; reused: number; old: number; breached: number };
  lastScanAt: string;
  /** Full analysis results — in-memory only, not persisted to server. */
  analysis: AnalysisResult | null;
}

/** Serializable subset persisted to server (encrypted). */
interface CachedState {
  score: number;
  counts: { weak: number; reused: number; old: number; breached: number };
  lastScanAt: string;
}

interface VaultRecord {
  id: string;
  encryptedWatchtowerState?: string | null;
}

interface ListResponse {
  items: ServerItemRecord[];
  nextCursor?: string;
}

type StateListener = (state: WatchtowerScanState | null) => void;

// ── Service ───────────────────────────────────────────────────────────

class WatchtowerScanService {
  private state: WatchtowerScanState | null = null;
  private listeners = new Set<StateListener>();
  private rescanTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private scanning = false;
  private vaultId: string | null = null;

  // ── Public API ────────────────────────────────────────────────────

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): WatchtowerScanState | null {
    return this.state;
  }

  isScanning(): boolean {
    return this.scanning;
  }

  /**
   * Start background scanning. Idempotent — calling multiple times
   * while a scan is in progress is a no-op.
   */
  async startBackgroundScan(): Promise<void> {
    if (this.scanning || !vaultCrypto.isUnlocked()) return;
    // Already initialized and scanning periodically
    if (this.rescanTimer && this.state) return;

    // Resolve vault ID
    try {
      const vaults = await trpcQuery<VaultRecord[]>("vault", "list");
      if (!vaults?.length) return;
      this.vaultId = vaults[0]!.id;
    } catch {
      return;
    }

    // Load cached state for instant badge display
    await this.loadCachedState();

    // Run fresh scan
    await this.runScan();

    // Set up periodic rescan (24h)
    this.stopRescanTimer();
    this.rescanTimer = setInterval(() => {
      if (vaultCrypto.isUnlocked()) {
        this.runScan();
      }
    }, RESCAN_INTERVAL_MS);
  }

  /** Clear all state and stop timers. Called on vault lock. */
  stopBackgroundScan(): void {
    this.state = null;
    this.vaultId = null;
    this.scanning = false;
    this.stopRescanTimer();
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.notify();
  }

  // ── Internal ──────────────────────────────────────────────────────

  private notify(): void {
    for (const fn of this.listeners) fn(this.state);
  }

  private stopRescanTimer(): void {
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer);
      this.rescanTimer = null;
    }
  }

  /** Try to load encrypted cached state from server for instant badge. */
  private async loadCachedState(): Promise<void> {
    if (!this.vaultId || !vaultCrypto.isUnlocked()) return;

    try {
      const vaultData = await trpcQuery<VaultRecord>("vault", "get", {
        vaultId: this.vaultId,
      });

      if (vaultData?.encryptedWatchtowerState) {
        const decrypted = await vaultCrypto.decryptBlob(
          vaultData.encryptedWatchtowerState,
          { logFailure: false },
        );
        const cached: CachedState = JSON.parse(
          new TextDecoder().decode(decrypted),
        );

        this.state = {
          score: cached.score,
          issueCount:
            cached.counts.weak +
            cached.counts.reused +
            cached.counts.old +
            cached.counts.breached,
          counts: cached.counts,
          lastScanAt: cached.lastScanAt,
          analysis: null,
        };
        this.notify();
      }
    } catch {
      // Silent fail — will rebuild from fresh scan
    }
  }

  /**
   * Drop cached state and rescan from scratch. Called on workspace switch:
   * switches happen without a reload, so a vaultId cached at unlock time can
   * belong to another org (the server 404s any vault outside the session's
   * active organization).
   */
  async restartForWorkspaceChange(): Promise<void> {
    this.stopBackgroundScan();
    await this.startBackgroundScan();
  }

  /** Run a fresh security scan on all vault items. */
  private async runScan(): Promise<void> {
    if (this.scanning || !this.vaultId || !vaultCrypto.isUnlocked()) return;
    this.scanning = true;

    try {
      const listData = await trpcQuery<ListResponse>("credentials", "list", {
        vaultId: this.vaultId,
      });

      if (!listData?.items?.length) {
        this.state = {
          score: 100,
          issueCount: 0,
          counts: { weak: 0, reused: 0, old: 0, breached: 0 },
          lastScanAt: new Date().toISOString(),
          analysis: {
            weak: [],
            reused: [],
            old: [],
            missing2fa: [],
            total: 0,
            score: 100,
            breakdown: {
              score: 100,
              categories: [],
              total: 0,
              totalPenalty: 0,
            },
          },
        };
        this.notify();
        this.scheduleSyncToServer();
        return;
      }

      // Decrypt items
      const decrypted: DecryptedVaultItem[] = [];
      for (const serverItem of listData.items) {
        try {
          const plain = await vaultCrypto.decryptItem(serverItem);
          decrypted.push({
            id: serverItem.id,
            itemType: (serverItem.itemType || "login") as DecryptedVaultItem["itemType"],
            isFavorite: serverItem.isFavorite ?? false,
            createdAt: serverItem.createdAt,
            updatedAt: serverItem.updatedAt,
            decrypted: plain,
          });
        } catch {
          // Skip items that fail to decrypt
        }
      }

      // Run analysis
      const analysis = await analyzeVault(decrypted);
      const reusedCount = analysis.reused.reduce((s, g) => s + g.length, 0);
      const counts = {
        weak: analysis.weak.length,
        reused: reusedCount,
        old: analysis.old.length,
        breached: 0, // Breach check requires explicit opt-in
      };

      this.state = {
        score: analysis.score,
        issueCount: counts.weak + counts.reused + counts.old,
        counts,
        lastScanAt: new Date().toISOString(),
        analysis,
      };
      this.notify();
      this.scheduleSyncToServer();
    } catch {
      // Silent fail — badge shows cached or zero
    } finally {
      this.scanning = false;
    }
  }

  /** Debounced: encrypt scan state and persist to server. */
  private scheduleSyncToServer(): void {
    if (!this.vaultId || !this.state) return;

    if (this.syncTimer) clearTimeout(this.syncTimer);

    this.syncTimer = setTimeout(async () => {
      if (!this.vaultId || !this.state || !vaultCrypto.isUnlocked()) return;

      try {
        const cached: CachedState = {
          score: this.state.score,
          counts: this.state.counts,
          lastScanAt: this.state.lastScanAt,
        };
        const serialized = new TextEncoder().encode(JSON.stringify(cached));
        const encrypted = await vaultCrypto.encryptBlob(serialized);
        await trpcMutation("vault", "updateWatchtowerState", {
          vaultId: this.vaultId,
          encryptedWatchtowerState: encrypted,
        });
      } catch {
        // Silent fail — will re-sync on next scan
      }
    }, SYNC_DEBOUNCE_MS);
  }
}

/** Singleton — import and use directly. */
export const watchtowerScan = new WatchtowerScanService();
