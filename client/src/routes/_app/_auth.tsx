// Copyright (c) 2026 Password Manager contributors
/**
 * Auth Guard Route Layout
 *
 * Explicit authentication gate machine:
 *   resolving   → auth + vault-status + any cloud-signup completion in progress
 *   recoveryKit → a pending-vault-setup bundle carries an unshown Secret Key
 *   createVault → authed, no vault yet (invited member who never registered a vault)
 *   unlock      → vault exists but no in-memory key (post-verification return)
 *   ready       → outlet renders; everything non-blocking runs in the background
 *
 * Device enrollment lives outside the machine — it runs as background work
 * kicked off by LoginForm/CreateVaultGate.
 */

import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAuthState } from "@/providers/AuthProvider";
import { WorkspaceProvider, useWorkspaceContext } from "@/providers/WorkspaceContext";
import { OrgVaultAutoGrantProvider } from "@/providers/OrgVaultAutoGrantProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  getPendingVaultSetup,
  clearPendingVaultSetup,
  hasPendingVaultSetup,
  type PendingVaultData,
} from "@/lib/pending-vault-setup";
import { trpcMutation, trpcQuery } from "@/lib/api/trpc";
import { RecoveryKit } from "@/components/auth/RecoveryKit";
import { CreateVaultGate } from "@/components/auth/CreateVaultGate";
import { MasterPasswordPrompt } from "@/components/vault/MasterPasswordPrompt";
import { vaultCrypto } from "@/services/vault-crypto";
import { restoreVaultKeyIfPossible } from "@/auth/persistent-unlock-bootstrap";
import { enrollDeviceInBackground } from "@/services/keypair-manager";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/_auth")({
  component: AuthLayout,
});

// ── Gate machine ─────────────────────────────────────────────────────

type PendingSetup = Pick<PendingVaultData,
  "email" | "secretKeyBase32" | "kdfSalt" | "encryptedVerificationBlob">;

type GateState =
  | { kind: "resolving" }
  | { kind: "recoveryKit"; kit: PendingSetup }
  | { kind: "createVault" }
  | { kind: "unlock"; salt: string; blob: string | null }
  | { kind: "ready" };

type GateAction =
  | { type: "showRecoveryKit"; kit: PendingSetup }
  | { type: "requireUnlock"; salt: string; blob: string | null }
  | { type: "requireCreateVault" }
  | { type: "ready" }
  | { type: "reset" };

function gateReducer(_state: GateState, action: GateAction): GateState {
  switch (action.type) {
    case "showRecoveryKit":
      return { kind: "recoveryKit", kit: action.kit };
    case "requireUnlock":
      return { kind: "unlock", salt: action.salt, blob: action.blob };
    case "requireCreateVault":
      return { kind: "createVault" };
    case "ready":
      return { kind: "ready" };
    case "reset":
      return { kind: "resolving" };
  }
}

function AuthLayoutContent() {
  const { t } = useTranslation("auth");
  const { status, isLoading, user } = useAuthState();
  const navigate = useNavigate();
  const isAuthenticated = status === "authenticated" || Boolean(user);

  const [gate, dispatch] = useReducer(gateReducer, { kind: "resolving" } as GateState);
  const resolvedRef = useRef(false);

  // Single resolver: runs once after auth settles. Threads through pending
  // cloud-signup completion, then checks vault existence, then lands on the
  // right blocking state (or "ready").
  useEffect(() => {
    if (resolvedRef.current) return;
    if (isLoading && !user) return;
    if (!isAuthenticated) return;

    resolvedRef.current = true;

    void (async () => {
      // 1. Complete any pending cloud-signup vault setup (email-verification
      //    landing) before deciding what to render.
      try {
        if (hasPendingVaultSetup()) {
          const pending = await getPendingVaultSetup();
          if (pending) {
            try {
              await trpcMutation("auth", "setupVault", {
                kdfSalt: pending.kdfSalt,
                encryptedVerificationBlob: pending.encryptedVerificationBlob,
              });
            } catch (err) {
              // Vault may already exist (re-registration) — proceed
              console.error("[AuthLayout] Pending vault setup failed:", err);
            }
            dispatch({
              type: "showRecoveryKit",
              kit: {
                email: pending.email,
                secretKeyBase32: pending.secretKeyBase32,
                kdfSalt: pending.kdfSalt,
                encryptedVerificationBlob: pending.encryptedVerificationBlob,
              },
            });
            return;
          }
        }
      } catch (err) {
        console.error("[AuthLayout] pending vault resolve failed:", err);
      }

      // 2. Vault existence probe: fail open so a broken check never traps.
      type VaultRow = {
        kdfSalt?: string | null;
        encryptedVerificationBlob?: string | null;
      };
      let firstVault: VaultRow | null = null;
      try {
        const vaults = await trpcQuery<VaultRow[]>("vault", "list");
        const hasVault = Array.isArray(vaults) && vaults.length > 0;
        if (!hasVault) {
          dispatch({ type: "requireCreateVault" });
          return;
        }
        firstVault = vaults[0] ?? null;
      } catch (err) {
        console.error("[AuthLayout] vault status check failed:", err);
        // Fail open — let the outlet render; downstream flows can re-prompt.
      }

      // 3. Silent restore (R4): try to unwrap the persisted vault key BEFORE
      //    the outlet mounts. Verified against the vault's sentinel; failure
      //    of any kind falls closed to the unlock prompt (never trusted
      //    without verification). See `auth/persistent-unlock-bootstrap.ts`.
      try {
        await restoreVaultKeyIfPossible(firstVault?.encryptedVerificationBlob);
      } catch (err) {
        console.error("[AuthLayout] silent restore failed:", err);
      }

      // 4. Still no in-memory key + we have salt/blob → open the unlock
      //    dialog inline instead of relying on downstream re-prompts, so
      //    org-shared-vault decryption sees a ready key at mount time (R4).
      if (
        !vaultCrypto.isUnlocked() &&
        firstVault?.kdfSalt &&
        firstVault.encryptedVerificationBlob
      ) {
        dispatch({
          type: "requireUnlock",
          salt: firstVault.kdfSalt,
          blob: firstVault.encryptedVerificationBlob,
        });
        return;
      }

      dispatch({ type: "ready" });
    })();
  }, [isLoading, isAuthenticated, user]);

  // Redirect effect (unchanged behaviour): unauth → /login.
  useEffect(() => {
    if (isLoading && !user) return;
    if (status === "unauthenticated" && !user) {
      const dest =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "";
      const redirect = dest && dest !== "/dashboard" ? dest : undefined;
      navigate({ to: "/login", search: { invitation: undefined, redirect } });
      return;
    }
  }, [status, isLoading, user, navigate]);

  const handleRecoveryConfirm = useCallback(() => {
    if (gate.kind !== "recoveryKit") return;
    const { kit } = gate;
    // Vault key only lives in memory; email-verification lands in a fresh
    // page so it's gone. Ask for master password to re-derive, unless
    // already unlocked (redirect back to this route from another tab).
    if (vaultCrypto.isUnlocked()) {
      void clearPendingVaultSetup();
      dispatch({ type: "ready" });
      // Enrollment can now run because the vault is unlocked.
      void enrollDeviceInBackground({
        onFailure: () => toast.warning(t("login.enrollment.deferred",
          "Device setup didn't finish. Retry from Settings → Devices.")),
      });
      navigate({ to: "/dashboard" });
    } else {
      dispatch({
        type: "requireUnlock",
        salt: kit.kdfSalt,
        blob: kit.encryptedVerificationBlob,
      });
    }
  }, [gate, navigate, t]);

  const handleUnlockComplete = useCallback(() => {
    void clearPendingVaultSetup();
    void enrollDeviceInBackground({
      onFailure: () => toast.warning(t("login.enrollment.deferred",
        "Device setup didn't finish. Retry from Settings → Devices.")),
    });
    dispatch({ type: "ready" });
    navigate({ to: "/dashboard" });
  }, [navigate, t]);

  const handleCreateVaultComplete = useCallback(() => {
    dispatch({ type: "ready" });
    navigate({ to: "/dashboard" });
  }, [navigate]);

  // ── Render ───────────────────────────────────────────────────────

  if (isLoading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated" && !user) return null;

  if (gate.kind === "resolving") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (gate.kind === "recoveryKit") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <RecoveryKit
            secretKeyBase32={gate.kit.secretKeyBase32}
            email={gate.kit.email}
            onConfirm={handleRecoveryConfirm}
          />
        </div>
      </div>
    );
  }

  if (gate.kind === "unlock") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <MasterPasswordPrompt
          open
          salt={gate.salt}
          verificationBlob={gate.blob}
          onUnlock={handleUnlockComplete}
          onClose={handleUnlockComplete}
        />
      </div>
    );
  }

  if (gate.kind === "createVault") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <CreateVaultGate
            email={user?.email ?? ""}
            onComplete={handleCreateVaultComplete}
          />
        </div>
      </div>
    );
  }

  return (
    <WorkspaceProvider>
      <WorkspaceKeyedOutlet />
    </WorkspaceProvider>
  );
}

/**
 * Remounts all authed routes when the active workspace changes so every
 * page refetches against the new org — equivalent to a page refresh,
 * but the in-memory vault key survives (no master-password re-prompt).
 */
function WorkspaceKeyedOutlet() {
  const { activeWorkspaceId } = useWorkspaceContext();
  return (
    <ErrorBoundary key={activeWorkspaceId ?? "no-workspace"}>
      <OrgVaultAutoGrantProvider>
        <Outlet />
      </OrgVaultAutoGrantProvider>
    </ErrorBoundary>
  );
}

function AuthLayout() {
  return <AuthLayoutContent />;
}
