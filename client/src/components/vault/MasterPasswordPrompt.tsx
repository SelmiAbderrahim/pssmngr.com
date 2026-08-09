// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Master Password Prompt
 *
 * Dialog that appears when the vault is locked and needs unlocking.
 * Derives the vault key client-side using Argon2id, then stores it
 * in memory only. The master password never leaves the browser.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, AlertCircle } from "lucide-react";
import { base64ToUint8, base32ToSecretKey, deriveVaultKey } from "@/lib/vault-crypto";
import { getSecretKey, setSecretKey } from "@/lib/device-keys";
import { vaultCrypto } from "@/services/vault-crypto";
import type { ServerItemRecord } from "@/services/vault-crypto";
import { clearPersistence as clearPersistentUnlock } from "@/lib/persistent-unlock";

export interface MasterPasswordPromptProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called after successful unlock. */
  onUnlock: () => void;
  /** KDF salt from the vault record (base64-encoded). */
  salt: string;
  /** Encrypted verification blob for master password validation. */
  verificationBlob?: string | null;
  /** Show the secret key input (for new device or recovery). */
  showSecretKeyInput?: boolean;
  /** Prevent closing without unlocking. */
  preventClose?: boolean;
  /** Called when user dismisses the dialog (only when preventClose is false). */
  onClose?: () => void;
  /** Enable recovery mode — shows old password field for vault re-keying. */
  recoveryMode?: boolean;
  /** Server items needed for re-wrapping during recovery. */
  serverItems?: ServerItemRecord[];
  /** Vault ID for the reKey API call. */
  vaultId?: string;
  /** Called after successful recovery (re-keying). */
  onRecovery?: () => void;
  /**
   * "verify" mode: derive the key, check it against the verification blob,
   * then discard the derived key WITHOUT setting the in-memory vault key.
   * Used by SensitiveActionGate to demand a fresh master password before a
   * sensitive action (export, master-password change, emergency access)
   * without extending the current session.
   */
  mode?: "unlock" | "verify";
}

export function MasterPasswordPrompt({
  open,
  onUnlock,
  salt,
  verificationBlob,
  showSecretKeyInput = false,
  preventClose = false,
  onClose,
  recoveryMode = false,
  serverItems,
  vaultId,
  onRecovery,
  mode = "unlock",
}: MasterPasswordPromptProps) {
  const { t } = useTranslation();
  const [hasPassword, setHasPassword] = useState(false);
  const [hasOldPassword, setHasOldPassword] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(showSecretKeyInput);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const oldPasswordRef = useRef<HTMLInputElement>(null);
  const secretKeyRef = useRef<HTMLInputElement>(null);

  // Focus password input when dialog opens
  useEffect(() => {
    if (!open) return;
    // Small delay to ensure dialog is rendered
    const timer = setTimeout(() => passwordRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [open]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      if (passwordRef.current) passwordRef.current.value = "";
      if (oldPasswordRef.current) oldPasswordRef.current.value = "";
      if (secretKeyRef.current) secretKeyRef.current.value = "";
      setHasPassword(false);
      setHasOldPassword(false);
      setError(null);
      setIsUnlocking(false);
      setIsRecovering(false);
    }
  }, [open]);

  // Sync showSecretKey with prop when dialog opens
  useEffect(() => {
    if (open && showSecretKeyInput) {
      setShowSecretKey(true);
    }
  }, [open, showSecretKeyInput]);

  const handleUnlock = useCallback(async () => {
    const password = passwordRef.current?.value ?? "";
    const oldPassword = oldPasswordRef.current?.value ?? "";
    const secretKeyInput = secretKeyRef.current?.value ?? "";

    if (!password.trim()) {
      setError(t("vault.enterPassword", "Please enter your master password."));
      return;
    }

    // Recovery mode: re-key vault with old password
    if (recoveryMode && oldPassword.trim() && serverItems && vaultId) {
      setIsRecovering(true);
      setError(null);

      try {
        const saltBytes = base64ToUint8(salt);
        const sk = secretKeyInput.trim()
          ? base32ToSecretKey(secretKeyInput.trim())
          : await getSecretKey();

        if (!sk) {
          setShowSecretKey(true);
          setError(
            t("vault.secretKeyRequired", "Secret key not found on this device. Please enter it below."),
          );
          setIsRecovering(false);
          return;
        }

        // Derive BOTH vault keys
        const { vaultKey: oldVaultKey } = await deriveVaultKey({
          masterPassword: oldPassword,
          secretKey: sk,
          salt: saltBytes,
        });
        const { vaultKey: newVaultKey } = await deriveVaultKey({
          masterPassword: password,
          secretKey: sk,
          salt: saltBytes,
        });

        // Re-wrap all items
        const reWrapped = await vaultCrypto.reWrapAllItems(
          oldVaultKey,
          newVaultKey,
          serverItems,
        );

        // Create verification blob with new key
        const newBlob = await vaultCrypto.createVerificationBlobWithKey(newVaultKey);

        // Send to server
        const { trpcMutation } = await import("@/lib/api/trpc");
        await trpcMutation("vault", "reKey", {
          vaultId,
          encryptedVerificationBlob: newBlob,
          items: reWrapped,
        });

        // Zero old key
        oldVaultKey.fill(0);

        // Recovery re-keys the vault → any persistent-unlock wrap of the
        // OLD key is now unusable; clear it before re-enabling under the new
        // key inside setKey().
        await clearPersistentUnlock();

        // Set the new vault key in memory and unlock (setKey enables
        // persistence if configured).
        vaultCrypto.setKey(newVaultKey);
        onRecovery?.();
        onUnlock();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Recovery failed";
        if (message.includes("old vault key is incorrect")) {
          setError(
            t("vault.wrongOldPassword", "Old master password is incorrect. Please try again."),
          );
        } else {
          setError(
            t("vault.recoveryFailed", "Vault recovery failed. Check both passwords and try again."),
          );
        }
      } finally {
        setIsRecovering(false);
      }
      return;
    }

    // Standard unlock flow
    setIsUnlocking(true);
    setError(null);

    try {
      const saltBytes = base64ToUint8(salt);

      // Parse secret key if provided
      let secretKey: Uint8Array | undefined;
      if (secretKeyInput.trim()) {
        try {
          secretKey = base32ToSecretKey(secretKeyInput.trim());
        } catch {
          setError(
            t("vault.invalidSecretKey", "Invalid secret key format."),
          );
          setIsUnlocking(false);
          return;
        }
      }

      if (mode === "verify") {
        // Verify-only: derive, check, discard. Never sets the vault key,
        // never persists — the action either fires this once or reprompts.
        const sk = secretKey ?? (await getSecretKey());
        if (!sk) {
          setShowSecretKey(true);
          setError(
            t(
              "vault.secretKeyRequired",
              "Secret key not found on this device. Please enter it below.",
            ),
          );
          setIsUnlocking(false);
          return;
        }
        const { vaultKey: candidate } = await deriveVaultKey({
          masterPassword: password,
          secretKey: sk,
          salt: saltBytes,
        });
        try {
          if (!verificationBlob) {
            throw new Error("Missing verification blob");
          }
          const ok = await vaultCrypto.verifyVaultKeyWithKey(
            candidate,
            verificationBlob,
          );
          if (!ok) {
            setError(
              t(
                "vault.wrongPassword",
                "Wrong master password. Please try again.",
              ),
            );
            return;
          }
          onUnlock();
        } finally {
          candidate.fill(0);
        }
        return;
      }

      await vaultCrypto.unlock(password, saltBytes, secretKey, verificationBlob);
      if (secretKey) {
        // Manually entered key verified against the verification blob —
        // persist it so this browser stops re-asking (mirrors the login flow).
        await setSecretKey(secretKey).catch(() => {});
      }
      onUnlock();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to unlock vault";

      // Provide a user-friendly message for common errors
      if (message.includes("Secret key not found")) {
        setShowSecretKey(true);
        setError(
          t(
            "vault.secretKeyRequired",
            "Secret key not found on this device. Please enter it below.",
          ),
        );
      } else if (message.includes("Wrong master password")) {
        setError(
          t(
            "vault.wrongPassword",
            "Wrong master password. Please try again.",
          ),
        );
      } else {
        setError(
          t(
            "vault.unlockFailed",
            "Failed to unlock vault. Check your master password and try again.",
          ),
        );
      }
    } finally {
      setIsUnlocking(false);
    }
  }, [salt, verificationBlob, onUnlock, t, recoveryMode, serverItems, vaultId, onRecovery, mode]);

  return (
    <Dialog
      open={open}
      onOpenChange={preventClose ? undefined : (open) => { if (!open) onClose?.(); }}
    >
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={preventClose ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={preventClose ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <DialogTitle>
              {t("vault.unlockTitle", "Unlock Vault")}
            </DialogTitle>
          </div>
          <DialogDescription>
            {recoveryMode
              ? t(
                  "vault.recoveryDescription",
                  "Your vault items could not be decrypted. Enter your previous master password and your current password to recover your data.",
                )
              : t(
                  "vault.unlockDescription",
                  "Enter your master password to decrypt your vault.",
                )}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isUnlocking && !isRecovering) handleUnlock();
          }}
        >
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Old Master Password (recovery mode only) */}
          {recoveryMode && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="old-master-password">
                {t("vault.oldMasterPassword", "Previous Master Password")}
              </Label>
              <Input
                ref={oldPasswordRef}
                id="old-master-password"
                type="password"
                onChange={(e) => setHasOldPassword(Boolean(e.currentTarget.value.trim()))}
                placeholder={t(
                  "vault.oldPasswordPlaceholder",
                  "Enter your previous master password",
                )}
                disabled={isRecovering}
                autoComplete="off"
              />
            </div>
          )}

          {/* Master Password (current) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="master-password">
              {recoveryMode
                ? t("vault.currentMasterPassword", "Current Master Password")
                : t("vault.masterPassword", "Master Password")}
            </Label>
            <Input
              ref={passwordRef}
              id="master-password"
              type="password"
              onChange={(e) => setHasPassword(Boolean(e.currentTarget.value.trim()))}
              placeholder={t(
                "vault.passwordPlaceholder",
                "Enter your master password",
              )}
              disabled={isUnlocking}
              autoComplete="off"
            />
          </div>

          {/* Secret Key (shown when needed) */}
          {showSecretKey && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="secret-key">
                {t("vault.secretKey", "Secret Key")}
              </Label>
              <Input
                ref={secretKeyRef}
                id="secret-key"
                type="password"
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X"
                disabled={isUnlocking}
                autoComplete="off"
                spellCheck={false}
                className="font-mono tracking-wider"
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "vault.secretKeyHint",
                  "Enter the secret key from your recovery kit.",
                )}
              </p>
            </div>
          )}

          {/* Unlock / Recover button */}
          <Button
            type="submit"
            disabled={isUnlocking || isRecovering || !hasPassword || (recoveryMode && !hasOldPassword)}
            className="w-full"
          >
            {isUnlocking || isRecovering ? (
              <>
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
                {isRecovering
                  ? t("vault.recovering", "Recovering vault…")
                  : t("vault.deriving", "Deriving key…")}
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 me-2" />
                {recoveryMode
                  ? t("vault.recover", "Recover Vault")
                  : t("vault.unlock", "Unlock")}
              </>
            )}
          </Button>

          {/* Toggle secret key input */}
          {!showSecretKey && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setShowSecretKey(true)}
            >
              {t("vault.useRecoveryKey", "Use recovery key")}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
