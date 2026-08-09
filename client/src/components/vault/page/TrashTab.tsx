// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { TrashView } from "@/components/vault/TrashView";

interface TrashTabProps {
  vaultId: string;
  onRestoreItem: () => void;
}

export function TrashTab({ vaultId, onRestoreItem }: TrashTabProps) {
  return <TrashView vaultId={vaultId} onRestoreItem={onRestoreItem} />;
}
