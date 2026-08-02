// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * SensitiveActionGate
 *
 * Wraps an action trigger (a button, menu item, dialog trigger). On click the
 * gate intercepts, opens a verify-only master-password prompt, and only fires
 * the original click handler after a fresh master-password verification.
 *
 * Grant is per-invocation — no caching, no time window. Two exports in a row =
 * two prompts. This is the "sensitive action" complement to persistent unlock:
 * even when the vault is silently restored, EXPORT / master-password change /
 * emergency access still demand the master password.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { MasterPasswordPrompt } from "@/components/vault/MasterPasswordPrompt";
import { trpcQuery } from "@/lib/api/trpc";
import { toast } from "sonner";

export type SensitiveAction =
  | "export"
  | "changeMasterPassword"
  | "emergencyAccess";

export interface SensitiveActionGateProps {
  children: React.ReactElement;
  action: SensitiveAction;
}

interface VaultLite {
  kdfSalt?: string | null;
  encryptedVerificationBlob?: string | null;
}

/**
 * Imperative variant for surfaces that can't wrap a single button. Returns
 * `[verify, dialogElement]`. Callers render `dialogElement` somewhere in
 * their tree and `await verify()` before running the sensitive action.
 * `verify()` resolves `true` on successful master-password verification and
 * `false` on cancel; identical fail-closed semantics to the wrapping form.
 */
export function useSensitiveActionVerify(
  action: SensitiveAction,
): [() => Promise<boolean>, React.ReactNode] {
  const [open, setOpen] = React.useState(false);
  const [meta, setMeta] = React.useState<VaultLite | null>(null);
  const resolverRef = React.useRef<((ok: boolean) => void) | null>(null);

  const verify = React.useCallback(async (): Promise<boolean> => {
    let vaults: VaultLite[] = [];
    try {
      vaults = await trpcQuery<VaultLite[]>("vault", "list");
    } catch {
      return false;
    }
    const first =
      Array.isArray(vaults) && vaults.length > 0 ? vaults[0]! : null;
    if (!first?.kdfSalt || !first.encryptedVerificationBlob) {
      return true; // nothing to verify against — fall through
    }
    setMeta(first);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const dialog =
    open && meta?.kdfSalt && meta.encryptedVerificationBlob ? (
      <MasterPasswordPrompt
        open={open}
        mode="verify"
        salt={meta.kdfSalt}
        verificationBlob={meta.encryptedVerificationBlob}
        onUnlock={() => {
          setOpen(false);
          resolverRef.current?.(true);
          resolverRef.current = null;
        }}
        onClose={() => {
          setOpen(false);
          resolverRef.current?.(false);
          resolverRef.current = null;
        }}
      />
    ) : null;

  // action param is currently only used for future per-action copy hooks.
  void action;
  return [verify, dialog];
}

export function SensitiveActionGate({
  children,
  action,
}: SensitiveActionGateProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = React.useState(false);
  const [meta, setMeta] = React.useState<VaultLite | null>(null);
  const pendingRef = React.useRef<((e: React.MouseEvent) => void) | null>(null);
  const pendingEventRef = React.useRef<React.MouseEvent | null>(null);

  const promptCopy = React.useMemo(() => {
    switch (action) {
      case "export":
        return t(
          "sensitiveAction.export",
          "Confirm your master password to export your vault",
        );
      // No live surface wires this action yet: the only shipped
      // master-password-change path (MasterPasswordPrompt recoveryMode in
      // VaultDialogs) self-verifies the old master password, so it is gated
      // by construction. A future deliberate change-MP UI must use this gate.
      case "changeMasterPassword":
        return t(
          "sensitiveAction.changeMasterPassword",
          "Confirm your master password to change it",
        );
      case "emergencyAccess":
        return t(
          "sensitiveAction.emergencyAccess",
          "Confirm your master password to update emergency access",
        );
    }
  }, [action, t]);

  const original = React.Children.only(children) as React.ReactElement<{
    onClick?: (e: React.MouseEvent) => void;
  }>;
  const originalOnClick = original.props.onClick;

  const handleClick = React.useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      pendingRef.current = originalOnClick ?? null;
      pendingEventRef.current = e;
      try {
        const vaults = await trpcQuery<VaultLite[]>("vault", "list");
        const first =
          Array.isArray(vaults) && vaults.length > 0 ? vaults[0]! : null;
        if (!first?.kdfSalt || !first.encryptedVerificationBlob) {
          // No vault yet — nothing to gate; let the original fire so the UI
          // surfaces its own "not set up" state.
          originalOnClick?.(e);
          return;
        }
        setMeta(first);
        setOpen(true);
      } catch {
        toast.error(
          t(
            "sensitiveAction.error.loadVault",
            "Couldn't verify your vault right now. Please try again.",
          ),
        );
      }
    },
    [originalOnClick, t],
  );

  const handleVerified = React.useCallback(() => {
    setOpen(false);
    const cb = pendingRef.current;
    const ev = pendingEventRef.current;
    pendingRef.current = null;
    pendingEventRef.current = null;
    if (cb && ev) cb(ev);
  }, []);

  const clone = React.cloneElement(original, { onClick: handleClick });

  return (
    <>
      {clone}
      {open && meta?.kdfSalt && meta.encryptedVerificationBlob && (
        <MasterPasswordPrompt
          open={open}
          mode="verify"
          salt={meta.kdfSalt}
          verificationBlob={meta.encryptedVerificationBlob}
          onUnlock={handleVerified}
          onClose={() => setOpen(false)}
        />
      )}
      {/* Screen-reader hint (rendered off-screen); a11y for the gate itself. */}
      <span className="sr-only" role="note" aria-live="polite">
        {promptCopy}
      </span>
    </>
  );
}
