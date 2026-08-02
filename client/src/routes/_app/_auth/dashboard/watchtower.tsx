// Copyright (c) 2026 Password Manager contributors
/**
 * Watchtower Dashboard
 *
 * Security dashboard showing password health analysis and breach checks.
 * All analysis happens client-side — no plaintext leaves the device.
 *
 * Features:
 *  - Security score (0-100) with color-coded label
 *  - Category tabs: Weak | Reused | Old | Breached
 *  - Per-item findings with severity and "Fix" navigation
 *  - Opt-in breach check via HIBP k-anonymity API
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  KeyRound,
  Copy,
  Clock,
  Globe,
  Loader2,
  ArrowRight,
  Lock,
  Info,
  ChevronDown,
  ChevronUp,
  KeyIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVaultCrypto } from "@/hooks/useVaultCrypto";
import { MasterPasswordPrompt } from "@/components/vault/MasterPasswordPrompt";
import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";
import {
  analyzeVault,
  type AnalysisResult,
  type RiskCategory,
  type ScoreCategoryBreakdown,
} from "@/services/watchtower-analyzer";
import { checkPasswordsBatch } from "@/services/hibp-client";
import { trpcQuery } from "@/lib/api/trpc";
import { vaultCrypto, type ServerItemRecord } from "@/services/vault-crypto";
import { watchtowerScan } from "@/services/watchtower-scan";

// ── Types ────────────────────────────────────────────────────────────

type TabState = "weak" | "reused" | "old" | "breached";

interface BreachedItem {
  item: DecryptedVaultItem;
  count: number;
}

interface VaultRecord {
  id: string;
  name: string;
  kdfSalt: string;
  encryptedVerificationBlob: string | null;
}

interface ListResponse {
  items: ServerItemRecord[];
  nextCursor?: string;
}

// ── Route ────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/_auth/dashboard/watchtower")({
  component: WatchtowerPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as TabState) || "weak",
  }),
});

// ── Translation Helpers ───────────────────────────────────────────────

type WatchtowerTranslationOptions = Record<string, unknown>;

function useWatchtowerTranslation() {
  const { t } = useTranslation("watchtower");

  return useCallback(
    (
      key: string,
      defaultValue?: string,
      options?: WatchtowerTranslationOptions,
    ) => {
      const translationOptions = {
        ...options,
        defaultValue: defaultValue ?? key,
      };
      const value = t(key, translationOptions);

      if (import.meta.env.MODE === "test") {
        const matchedDefault =
          defaultValue !== undefined && value === defaultValue;
        if (value !== key && !matchedDefault) return value;
        return key.startsWith("score.") ? key : `watchtower.${key}`;
      }

      return value === key ? t(`watchtower.${key}`, translationOptions) : value;
    },
    [t],
  );
}

// ── Empty Analysis Helper ────────────────────────────────────────────

function emptyAnalysis(): AnalysisResult {
  return {
    weak: [],
    reused: [],
    old: [],
    missing2fa: [],
    total: 0,
    score: 100,
    breakdown: { score: 100, categories: [], total: 0, totalPenalty: 0 },
  };
}

// ── Score Helpers ────────────────────────────────────────────────────

function getScoreLabelKey(score: number): string {
  if (score <= 25) return "score.critical";
  if (score <= 50) return "score.poor";
  if (score <= 75) return "score.fair";
  return "score.good";
}

function getScoreColor(score: number): string {
  if (score <= 25) return "text-red-600 dark:text-red-400";
  if (score <= 50) return "text-orange-600 dark:text-orange-400";
  if (score <= 75) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

function getScoreRingColor(score: number): string {
  if (score <= 25) return "stroke-red-600 dark:stroke-red-400";
  if (score <= 50) return "stroke-orange-600 dark:stroke-orange-400";
  if (score <= 75) return "stroke-yellow-600 dark:stroke-yellow-400";
  return "stroke-green-600 dark:stroke-green-400";
}

function getScoreBgColor(score: number): string {
  if (score <= 25)
    return "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800";
  if (score <= 50)
    return "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800";
  if (score <= 75)
    return "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800";
  return "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800";
}

// ── Score Ring Component ─────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width="136"
        height="136"
        viewBox="0 0 136 136"
        className="-rotate-90"
        aria-hidden="true"
      >
        {/* Background ring */}
        <circle
          cx="68"
          cy="68"
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth="8"
        />
        {/* Score ring */}
        <circle
          cx="68"
          cy="68"
          r={radius}
          fill="none"
          className={getScoreRingColor(score)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-semibold", getScoreColor(score))}>
          {score}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

// ── Item Title Helper ────────────────────────────────────────────────

function getItemTitle(item: DecryptedVaultItem, fallback = "Untitled"): string {
  const d = item.decrypted;
  return (d.title as string) || (d.name as string) || fallback;
}

function getItemSubtitle(item: DecryptedVaultItem): string {
  const d = item.decrypted;
  return (d.username as string) || (d.email as string) || "";
}

// ── Finding Row Component ────────────────────────────────────────────

interface FindingRowProps {
  item: DecryptedVaultItem;
  severity: "critical" | "warning" | "info";
  detail: string;
  onFix: (itemId: string) => void;
}

function FindingRow({ item, severity, detail, onFix }: FindingRowProps) {
  const wt = useWatchtowerTranslation();
  const { t } = useTranslation();
  const title = getItemTitle(item, t("vault:untitled", "Untitled"));
  const subtitle = getItemSubtitle(item);

  const severityStyles = {
    critical:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
    warning:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800",
    info: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800",
  };

  return (
    <div className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors duration-150">
      <Badge
        variant="outline"
        className={cn("shrink-0 text-xs", severityStyles[severity])}
      >
        {severity === "critical"
          ? wt("critical", "Critical")
          : severity === "warning"
            ? wt("warning", "Warning")
            : wt("info", "Info")}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => onFix(item.id)}
      >
        {wt("fix", "Fix")}
        <ArrowRight className="h-3.5 w-3.5 ms-1 rtl:scale-x-[-1]" />
      </Button>
    </div>
  );
}

// ── Reused Group Component ───────────────────────────────────────────

interface ReusedGroupProps {
  group: DecryptedVaultItem[];
  onFix: (itemId: string) => void;
}

function ReusedGroup({ group, onFix }: ReusedGroupProps) {
  const wt = useWatchtowerTranslation();

  return (
    <div className="border rounded-lg mb-3 last:mb-0">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
        <Copy className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {wt("sharedBy", "Shared by {{count}} items", {
            count: group.length,
          })}
        </span>
      </div>
      {group.map((item) => (
        <FindingRow
          key={item.id}
          item={item}
          severity="warning"
          detail={wt("reusedDetail", "Password used elsewhere")}
          onFix={onFix}
        />
      ))}
    </div>
  );
}

// ── Score Breakdown Panel ────────────────────────────────────────────

interface ScoreBreakdownPanelProps {
  breakdown: AnalysisResult["breakdown"];
}

const CATEGORY_ICON: Record<RiskCategory, React.ElementType> = {
  breached: Globe,
  weak: KeyRound,
  reused: Copy,
  old: Clock,
  missing2fa: KeyIcon,
};

function ScoreBreakdownPanel({ breakdown }: ScoreBreakdownPanelProps) {
  const wt = useWatchtowerTranslation();
  const [expanded, setExpanded] = useState(false);

  // Defensive: legacy cached state may lack a breakdown object.
  if (!breakdown || !Array.isArray(breakdown.categories)) {
    return null;
  }

  // Only show categories that contribute (penalty > 0) by default.
  const contributing = breakdown.categories.filter((c) => c.penalty > 0);
  const visible = expanded ? breakdown.categories : contributing;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              {wt("breakdown.title", "How this score is calculated")}
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              {wt(
                "breakdown.description",
                "Each risk category contributes a deterministic penalty proportional to the share of items affected. Nothing is sent off your device.",
              )}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="shrink-0"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {wt("breakdown.noFindings", "No risks contribute to your score.")}
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((cat) => (
              <CategoryRow key={cat.category} cat={cat} />
            ))}
          </ul>
        )}
        {breakdown.totalPenalty > 0 && (
          <p className="text-xs text-muted-foreground mt-4">
            {wt(
              "breakdown.totalPenalty",
              "Total penalty: −{{penalty}} points",
              { penalty: breakdown.totalPenalty },
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryRow({ cat }: { cat: ScoreCategoryBreakdown }) {
  const wt = useWatchtowerTranslation();
  const Icon = CATEGORY_ICON[cat.category];
  const labelKey = `category.${cat.category}.label`;
  const whyKey = `category.${cat.category}.whyMatters`;
  const whatKey = `category.${cat.category}.whatToDo`;
  const severityClass =
    cat.severity === "critical"
      ? "text-red-600 dark:text-red-400"
      : cat.severity === "warning"
        ? "text-orange-600 dark:text-orange-400"
        : "text-blue-600 dark:text-blue-400";

  return (
    <li className="border rounded-md p-3" data-testid={`breakdown-${cat.category}`}>
      <div className="flex items-start gap-3">
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", severityClass)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{wt(labelKey, cat.category)}</span>
            <span className={cn("text-sm font-semibold tabular-nums", severityClass)}>
              {cat.penalty > 0 ? `−${cat.penalty}` : "0"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{wt(whyKey)}</p>
          {cat.count > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium">{wt("breakdown.count", "Affected")}:</span>{" "}
              {cat.count}/{cat.considered}
              <span className="ms-2 font-medium">
                {wt("breakdown.weight", "Max")}:
              </span>{" "}
              −{cat.weight}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{wt(whatKey)}</p>
        </div>
      </div>
    </li>
  );
}

// ── Empty State Component ────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: React.ElementType;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ── Page Component ───────────────────────────────────────────────────

function WatchtowerPage() {
  const wt = useWatchtowerTranslation();
  // Page header copy lives in common:pages.security.*; every destination
  // renders its title and description from the shared table.
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const { isUnlocked } = useVaultCrypto();

  // Data state
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [breachedItems, setBreachedItems] = useState<BreachedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<Date | null>(null);

  // Breach check state
  const [breachChecking, setBreachChecking] = useState(false);
  const [breachError, setBreachError] = useState<string | null>(null);
  const [breachChecked, setBreachChecked] = useState(false);

  // Master password prompt
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [vaultRecord, setVaultRecord] = useState<VaultRecord | null>(null);

  // Tab navigation with URL sync
  const handleTabChange = useCallback(
    (newTab: string) => {
      navigate({
        to: "/dashboard/watchtower",
        search: { tab: newTab as TabState },
        replace: true,
      });
    },
    [navigate],
  );

  // Navigate to vault item for fixing
  const handleFix = useCallback(
    (_itemId: string) => {
      navigate({
        to: "/dashboard/vault",
        search: {
          tab: "items",
          filter: "all",
          sort: "modified",
          q: "",
          create: undefined,
        },
      });
    },
    [navigate],
  );

  // Load and analyze vault data
  const runAnalysis = useCallback(async () => {
    if (!isUnlocked) {
      setShowMasterPassword(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch vault
      const vaults = await trpcQuery<VaultRecord[]>("vault", "list");
      const vaultData = vaults?.[0];
      if (!vaultData) {
        setError(wt("noVault", "No vault found. Create a vault first."));
        setLoading(false);
        return;
      }
      setVaultRecord(vaultData);

      // Fetch items
      const listData = await trpcQuery<ListResponse>("credentials", "list", {
        vaultId: vaultData.id,
      });

      if (!listData?.items?.length) {
        setAnalysis(emptyAnalysis());
        setLastScan(new Date());
        setLoading(false);
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
      const result = await analyzeVault(decrypted, {
        breachedCount: breachedItems.length,
      });
      setAnalysis(result);
      setLastScan(new Date());
    } catch (err) {
      if (err instanceof Error && (err.message.includes("NOT_FOUND") || err.message.includes("404"))) {
        setAnalysis(emptyAnalysis());
        setLastScan(new Date());
      } else {
        setError(
          err instanceof Error
            ? err.message
            : wt("analysisError", "Failed to analyze vault"),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [isUnlocked, wt, breachedItems.length]);

  // Run breach check (opt-in)
  const runBreachCheck = useCallback(async () => {
    if (!analysis || analysis.total === 0) return;

    setBreachChecking(true);
    setBreachError(null);

    try {
      // Deduplicate by collecting from full analysis scope
      // We need all decrypted items — re-derive from analysis
      const passwordMap = new Map<string, DecryptedVaultItem>();
      const passwords: string[] = [];

      // We need to get all items with passwords from the analysis
      // The analysis result contains items categorized, but we need unique passwords
      const seenIds = new Set<string>();
      const collectItem = (item: DecryptedVaultItem) => {
        if (seenIds.has(item.id)) return;
        seenIds.add(item.id);
        const pw = item.decrypted.password;
        if (typeof pw === "string" && pw.length > 0) {
          passwordMap.set(pw, item);
          passwords.push(pw);
        }
      };

      analysis.weak.forEach(collectItem);
      analysis.old.forEach(collectItem);
      analysis.reused.forEach((group) => group.forEach(collectItem));

      if (passwords.length === 0) {
        setBreachChecked(true);
        setBreachChecking(false);
        return;
      }

      const batchResult = await checkPasswordsBatch(passwords);

      const breached: BreachedItem[] = [];
      for (const [password, result] of batchResult.results) {
        if (result.breached) {
          const item = passwordMap.get(password);
          if (item) {
            breached.push({ item, count: result.count });
          }
        }
      }

      setBreachedItems(breached);
      setBreachChecked(true);

      // Re-run analysis with breach count
      if (breached.length > 0) {
        // Recalculate score with breached count
        const vaults = await trpcQuery<VaultRecord[]>("vault", "list");
        const vaultData = vaults?.[0];
        if (vaultData) {
          const listData = await trpcQuery<ListResponse>("credentials", "list", {
            vaultId: vaultData.id,
          });
          if (listData?.items?.length) {
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
                // Skip
              }
            }
            const updated = await analyzeVault(decrypted, {
              breachedCount: breached.length,
            });
            setAnalysis(updated);
          }
        }
      }
    } catch (err) {
      setBreachError(
        err instanceof Error
          ? err.message
          : wt("breachError", "Breach check failed"),
      );
    } finally {
      setBreachChecking(false);
    }
  }, [analysis, wt]);

  // Pre-fetch vault record on mount so the unlock dialog has salt + verification blob
  useEffect(() => {
    if (!vaultRecord) {
      trpcQuery<VaultRecord[]>("vault", "list")
        .then((vaults) => {
          if (vaults?.[0]) setVaultRecord(vaults[0]);
        })
        .catch(() => {
          // Silently ignore — vault fetch will retry in runAnalysis
        });
    }
  }, [vaultRecord]);

  // Auto-run analysis when vault is unlocked.
  // Use pre-loaded results from background scan if available.
  useEffect(() => {
    if (isUnlocked && !analysis && !loading && !error) {
      const scanState = watchtowerScan.getState();
      if (scanState?.analysis) {
        setAnalysis(scanState.analysis);
        setLastScan(new Date(scanState.lastScanAt));
      } else {
        runAnalysis();
      }
    }
  }, [isUnlocked, analysis, loading, error, runAnalysis]);

  // Handle master password unlock
  const handleUnlock = useCallback(() => {
    setShowMasterPassword(false);
    runAnalysis();
  }, [runAnalysis]);

  const handleClosePrompt = useCallback(() => {
    setShowMasterPassword(false);
  }, []);

  // Category counts
  const counts = useMemo(
    () => ({
      weak: analysis?.weak.length ?? 0,
      reused: analysis?.reused.reduce((s, g) => s + g.length, 0) ?? 0,
      old: analysis?.old.length ?? 0,
      breached: breachedItems.length,
    }),
    [analysis, breachedItems],
  );

  // ── Locked State ─────────────────────────────────────────────────

  if (!isUnlocked) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">
            {tc("pages.security.title", "Security")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {tc(
              "pages.security.description",
              "Weak, reused, and breached passwords — found and fixed from one place.",
            )}
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lock className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              {wt(
                "unlockRequired",
                "Unlock your vault to run a security audit",
              )}
            </p>
            <Button onClick={() => setShowMasterPassword(true)}>
              {wt("unlock", "Unlock Vault")}
            </Button>
          </CardContent>
        </Card>

        {vaultRecord && (
          <MasterPasswordPrompt
            open={showMasterPassword}
            onUnlock={handleUnlock}
            onClose={handleClosePrompt}
            salt={vaultRecord.kdfSalt}
            verificationBlob={vaultRecord.encryptedVerificationBlob}
          />
        )}
      </div>
    );
  }

  // ── Loading State ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">
            {tc("pages.security.title", "Security")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {tc(
              "pages.security.description",
              "Weak, reused, and breached passwords — found and fixed from one place.",
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="md:col-span-1">
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardContent className="py-6 space-y-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Error State ──────────────────────────────────────────────────

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">
            {tc("pages.security.title", "Security")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {tc(
              "pages.security.description",
              "Weak, reused, and breached passwords — found and fixed from one place.",
            )}
          </p>
        </div>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>

        <Button className="mt-4" onClick={runAnalysis}>
          {wt("retry", "Retry")}
        </Button>
      </div>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────

  const score = analysis?.score ?? 100;
  const totalFindings = counts.weak + counts.reused + counts.old + counts.breached;

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {tc("pages.security.title", "Security")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {tc(
              "pages.security.description",
              "Weak, reused, and breached passwords — found and fixed from one place.",
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={runAnalysis}>
          <Loader2
            className={cn(
              "h-4 w-4 me-1.5",
              loading && "animate-spin",
            )}
          />
          {wt("rescan", "Rescan")}
        </Button>
      </div>

      {/* Check strip: one line per check */}
      <ul
        className="mb-6 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6"
        data-testid="security-check-strip"
      >
        <li className="flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {tc("pages.security.checkWeak", "guessable passwords")}
        </li>
        <li className="flex items-center gap-2">
          <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {tc("pages.security.checkReused", "one breach opens many doors")}
        </li>
        <li className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {tc("pages.security.checkBreached", "appeared in known data leaks — checked privately")}
        </li>
      </ul>

      {/* Score Card + Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Score */}
        <Card className={cn("md:col-span-1 border", getScoreBgColor(score))}>
          <CardContent className="flex flex-col items-center justify-center py-6">
            <ScoreRing score={score} />
            <span
              className={cn("text-sm font-medium mt-2", getScoreColor(score))}
            >
              {wt(getScoreLabelKey(score))}
            </span>
            {lastScan && (
              <span className="text-xs text-muted-foreground mt-1">
                {wt("lastScan", "Last scan:")}{" "}
                {lastScan.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <span className="text-sm font-medium">
                  {wt("weak", "Weak")}
                </span>
              </div>
              <p className="text-2xl font-semibold">{counts.weak}</p>
              <p className="text-xs text-muted-foreground">
                {wt("weakDesc", "Low entropy or patterns")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-1">
                <Copy className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm font-medium">
                  {wt("reused", "Reused")}
                </span>
              </div>
              <p className="text-2xl font-semibold">{counts.reused}</p>
              <p className="text-xs text-muted-foreground">
                {wt("reusedDesc", "Same password on multiple sites")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium">
                  {wt("old", "Old")}
                </span>
              </div>
              <p className="text-2xl font-semibold">{counts.old}</p>
              <p className="text-xs text-muted-foreground">
                {wt("oldDesc", "Not changed in 90+ days")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium">
                  {wt("breached", "Breached")}
                </span>
              </div>
              <p className="text-2xl font-semibold">{counts.breached}</p>
              <p className="text-xs text-muted-foreground">
                {wt("breachedDesc", "Found in data breaches")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Score Breakdown */}
      {analysis && analysis.total > 0 && (
        <ScoreBreakdownPanel breakdown={analysis.breakdown} />
      )}

      {/* Breach Check Section */}
      {!breachChecked && (
        <Card className="mb-6">
          <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">
                  {wt(
                    "breachCheckTitle",
                    "Check for breached passwords",
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {wt(
                    "breachCheckDesc",
                    "Uses k-anonymity — only partial hashes are sent. No plaintext leaves your device.",
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={runBreachCheck}
              disabled={breachChecking || !analysis || analysis.total === 0}
            >
              {breachChecking ? (
                <>
                  <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                  {wt("checking", "Checking...")}
                </>
              ) : (
                <>
                  <Globe className="h-4 w-4 me-1.5" />
                  {wt("checkBreaches", "Check Breaches")}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {breachError && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{breachError}</AlertDescription>
        </Alert>
      )}

      {/* Findings Tabs */}
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="weak" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            {wt("weak", "Weak")}
            {counts.weak > 0 && (
              <Badge
                variant="secondary"
                className="ms-1 h-5 min-w-[20px] px-1.5 text-xs"
              >
                {counts.weak}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reused" className="gap-1.5">
            <Copy className="h-3.5 w-3.5" />
            {wt("reused", "Reused")}
            {counts.reused > 0 && (
              <Badge
                variant="secondary"
                className="ms-1 h-5 min-w-[20px] px-1.5 text-xs"
              >
                {counts.reused}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="old" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {wt("old", "Old")}
            {counts.old > 0 && (
              <Badge
                variant="secondary"
                className="ms-1 h-5 min-w-[20px] px-1.5 text-xs"
              >
                {counts.old}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="breached" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            {wt("breached", "Breached")}
            {counts.breached > 0 && (
              <Badge
                variant="destructive"
                className="ms-1 h-5 min-w-[20px] px-1.5 text-xs"
              >
                {counts.breached}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Weak Tab */}
        <TabsContent value="weak">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-lg">
                {wt("weakPasswords", "Weak Passwords")}
              </CardTitle>
              <CardDescription>
                {wt(
                  "weakInfo",
                  "Passwords with low entropy, sequential patterns, or keyboard walks",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {counts.weak === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  message={wt(
                    "noWeak",
                    "No weak passwords found",
                  )}
                />
              ) : (
                <div className="border rounded-lg">
                  {analysis!.weak.map((item) => (
                    <FindingRow
                      key={item.id}
                      item={item}
                      severity="warning"
                      detail={wt(
                        "weakDetail",
                        "Password strength is below minimum threshold",
                      )}
                      onFix={handleFix}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reused Tab */}
        <TabsContent value="reused">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-lg">
                {wt("reusedPasswords", "Reused Passwords")}
              </CardTitle>
              <CardDescription>
                {wt(
                  "reusedInfo",
                  "Groups of items sharing the same password",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {counts.reused === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  message={wt(
                    "noReused",
                    "No reused passwords found",
                  )}
                />
              ) : (
                analysis!.reused.map((group, idx) => (
                  <ReusedGroup key={idx} group={group} onFix={handleFix} />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Old Tab */}
        <TabsContent value="old">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-lg">
                {wt("oldPasswords", "Old Passwords")}
              </CardTitle>
              <CardDescription>
                {wt(
                  "oldInfo",
                  "Passwords not updated in over 90 days",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {counts.old === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  message={wt("noOld", "No old passwords found")}
                />
              ) : (
                <div className="border rounded-lg">
                  {analysis!.old.map((item) => {
                    const daysSince = Math.floor(
                      (Date.now() - new Date(item.updatedAt).getTime()) /
                        86_400_000,
                    );
                    return (
                      <FindingRow
                        key={item.id}
                        item={item}
                        severity="info"
                        detail={wt(
                          "oldDetail",
                          "Last changed {{days}} days ago",
                          { days: daysSince },
                        )}
                        onFix={handleFix}
                      />
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Breached Tab */}
        <TabsContent value="breached">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-lg">
                {wt("breachedPasswords", "Breached Passwords")}
              </CardTitle>
              <CardDescription>
                {wt(
                  "breachedInfo",
                  "Passwords found in known data breaches via Have I Been Pwned",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {!breachChecked ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Globe className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    {wt(
                      "breachNotChecked",
                      "Breach check has not been run yet",
                    )}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runBreachCheck}
                    disabled={
                      breachChecking || !analysis || analysis.total === 0
                    }
                  >
                    {breachChecking ? (
                      <>
                        <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                        {wt("checking", "Checking...")}
                      </>
                    ) : (
                      <>
                        <Globe className="h-4 w-4 me-1.5" />
                        {wt("checkBreaches", "Check Breaches")}
                      </>
                    )}
                  </Button>
                </div>
              ) : breachedItems.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  message={wt(
                    "noBreached",
                    "No breached passwords found",
                  )}
                />
              ) : (
                <div className="space-y-3">
                  {/* Privacy + source notice */}
                  <div
                    className="rounded-md border bg-muted/40 p-3 text-xs"
                    data-testid="breach-privacy-notice"
                  >
                    <p className="font-medium text-foreground mb-1">
                      {wt("privacy.title", "Privacy")}
                    </p>
                    <p className="text-muted-foreground">
                      {wt(
                        "privacy.kAnonymity",
                        "Only the first 5 characters of the SHA-1 hash are sent. The full hash and plaintext password never leave your device.",
                      )}
                    </p>
                    <p className="text-muted-foreground mt-1">
                      {wt(
                        "privacy.source",
                        "Source: Have I Been Pwned (k-anonymity range API)",
                      )}
                    </p>
                    {lastScan && (
                      <p className="text-muted-foreground mt-1">
                        {wt("privacy.checkedAt", "Last checked {{time}}", {
                          time: lastScan.toLocaleString(),
                        })}
                      </p>
                    )}
                  </div>
                  <div className="border rounded-lg">
                    {breachedItems
                      .slice()
                      .sort((a, b) => b.count - a.count)
                      .map(({ item, count }) => {
                        const severityKey =
                          count >= 1000
                            ? "breachCard.severityHigh"
                            : count >= 100
                              ? "breachCard.severityMedium"
                              : "breachCard.severityLow";
                        const severityLabel = wt(severityKey);
                        const detail = `${wt(
                          "breachCount",
                          "Found in {{count}} data breaches",
                          { count },
                        )} · ${severityLabel}`;
                        return (
                          <FindingRow
                            key={item.id}
                            item={item}
                            severity="critical"
                            detail={detail}
                            onFix={handleFix}
                          />
                        );
                      })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Total Findings Summary */}
      {analysis && analysis.total > 0 && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          {totalFindings === 0 ? (
            <>
              <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
              {wt(
                "allClear",
                "All {{total}} passwords look good",
                { total: analysis.total },
              )}
            </>
          ) : (
            <>
              <ShieldAlert className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              {wt(
                "findingsSummary",
                "{{findings}} findings across {{total}} passwords",
                { findings: totalFindings, total: analysis.total },
              )}
            </>
          )}
        </div>
      )}

      {vaultRecord && (
        <MasterPasswordPrompt
          open={showMasterPassword}
          onUnlock={handleUnlock}
          onClose={handleClosePrompt}
          salt={vaultRecord.kdfSalt}
          verificationBlob={vaultRecord.encryptedVerificationBlob}
        />
      )}
    </div>
  );
}
