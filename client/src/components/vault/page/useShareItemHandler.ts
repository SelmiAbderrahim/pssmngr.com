// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { useCallback } from "react";
import { trpcMutation } from "@/lib/api/trpc";
import type { ServerItemRecord } from "@/services/vault-crypto";
import type { SharePermission } from "@/types/sharing";
import type { ActiveDialog } from "./types";

export function useShareItemHandler(
  dialog: ActiveDialog,
  serverItems: ServerItemRecord[],
) {
  return useCallback(
    async (recipientEmail: string, permission: SharePermission) => {
      if (dialog.kind !== "share") return;
      const serverItem = serverItems.find((i) => i.id === dialog.itemId);
      if (!serverItem) throw new Error("Item not found");
      const { prepareSharePayload } = await import(
        "@/services/sharing-crypto"
      );
      const envelope = await prepareSharePayload(
        recipientEmail,
        serverItem.wrappedDataKey,
        serverItem.wrappedDataKeyNonce,
        serverItem.wrappedDataKeyAuthTag,
      );
      await trpcMutation("sharing", "shareItem", {
        itemId: dialog.itemId,
        recipientUserId: envelope.recipientUserId,
        wrappedKey: envelope.wrappedKey,
        wrappedKeyNonce: envelope.wrappedKeyNonce,
        wrappedKeyAuthTag: envelope.wrappedKeyAuthTag,
        senderSignature: envelope.senderSignature,
        permission,
      });
      window.dispatchEvent(new CustomEvent("pssmngr:shares-changed"));
    },
    [dialog, serverItems],
  );
}
