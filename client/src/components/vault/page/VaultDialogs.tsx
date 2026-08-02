// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * VaultDialogs
 *
 * Pure switch over the ActiveDialog union. Opening one dialog closes any
 * other by construction — only one variant of the union can be set at a
 * time. See ./types.ts for the ActiveDialog shape.
 */

import { useCallback } from "react";
import { CreateItemDialog } from "@/components/vault/CreateItemDialog";
import { QRScannerDialog } from "@/components/vault/QRScannerDialog";
import { TOTPPreviewDialog } from "@/components/vault/TOTPPreviewDialog";
import { ShareFlow } from "@/components/vault/ShareFlow";
import { MasterPasswordPrompt } from "@/components/vault/MasterPasswordPrompt";
import type {
  DecryptedVaultItem,
  ItemType,
} from "@/components/vault/VaultItemCard";
import type { ServerItemRecord } from "@/services/vault-crypto";
import type { OTPAuthURI } from "@/services/totp-engine";
import type { SharePermission } from "@/types/sharing";
import type { VaultRecord } from "./utils";
import type { ActiveDialog } from "./types";

interface VaultDialogsProps {
  dialog: ActiveDialog;
  setDialog: (d: ActiveDialog) => void;
  canMutateItems: boolean;
  vault: VaultRecord | null;
  serverItems: ServerItemRecord[];
  decryptedItems: DecryptedVaultItem[];
  onCreateItem: (
    itemType: ItemType,
    data: Record<string, unknown>,
  ) => Promise<void>;
  getExistingItems: () => Promise<DecryptedVaultItem[]>;
  onQRResult: (parsed: OTPAuthURI) => void;
  onTOTPConfirm: (title: string, data: OTPAuthURI) => Promise<void>;
  onShareItem: (
    recipientEmail: string,
    permission: SharePermission,
  ) => Promise<void>;
  onUnlock: () => void;
  onRecovery: () => void;
  decryptionFailed: boolean;
  t: (key: string, fallback: string, opts?: Record<string, unknown>) => string;
}

export function VaultDialogs({
  dialog,
  setDialog,
  canMutateItems,
  vault,
  serverItems,
  decryptedItems,
  onCreateItem,
  getExistingItems,
  onQRResult,
  onTOTPConfirm,
  onShareItem,
  onUnlock,
  onRecovery,
  decryptionFailed,
  t,
}: VaultDialogsProps) {
  const close = useCallback(() => setDialog({ kind: "none" }), [setDialog]);

  const closeIfOpen = useCallback(
    (open: boolean) => {
      if (!open) close();
    },
    [close],
  );

  const shareItem =
    dialog.kind === "share"
      ? (decryptedItems.find((i) => i.id === dialog.itemId) ?? null)
      : null;

  return (
    <>
      {/* Master Password Prompt (unlock).
          recoveryMode is the app's only live master-password-change (re-key)
          surface. It is gated by construction: MasterPasswordPrompt refuses to
          re-key without the OLD master password, so wrapping it in
          SensitiveActionGate("changeMasterPassword") would double-prompt.
          Any future deliberate "change master password" UI must either wrap in
          that gate or reuse this recovery flow. */}
      {vault && (
        <MasterPasswordPrompt
          open={dialog.kind === "unlock"}
          onUnlock={onUnlock}
          onClose={close}
          salt={vault.kdfSalt}
          verificationBlob={vault.encryptedVerificationBlob}
          showSecretKeyInput={decryptionFailed}
          recoveryMode={decryptionFailed}
          serverItems={serverItems}
          vaultId={vault.id}
          onRecovery={onRecovery}
        />
      )}

      {/* Create Item */}
      <CreateItemDialog
        open={dialog.kind === "createItem" && canMutateItems}
        onOpenChange={closeIfOpen}
        onSubmit={async (itemType, data) => {
          await onCreateItem(itemType, data);
          close();
        }}
        getExistingItems={getExistingItems}
        initialItemType={
          (dialog.kind === "createItem" && dialog.itemType) || "login"
        }
      />

      {/* QR Scanner */}
      <QRScannerDialog
        open={dialog.kind === "qrScanner"}
        onOpenChange={closeIfOpen}
        onResult={onQRResult}
      />

      {/* TOTP Preview */}
      <TOTPPreviewDialog
        open={dialog.kind === "totpPreview"}
        onOpenChange={closeIfOpen}
        parsed={dialog.kind === "totpPreview" ? dialog.uri : null}
        onConfirm={onTOTPConfirm}
      />

      {/* Share Flow (person + link) */}
      {dialog.kind === "share" && shareItem && (
        <ShareFlow
          open
          onOpenChange={closeIfOpen}
          itemId={dialog.itemId}
          itemTitle={
            (shareItem.decrypted.title as string) ||
            t("vault:untitled", "Untitled")
          }
          itemData={JSON.stringify(shareItem.decrypted)}
          onShare={onShareItem}
        />
      )}
    </>
  );
}
