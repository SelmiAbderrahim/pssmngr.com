// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { SharingCenter } from "@/components/vault/SharingCenter";

interface SharingTabProps {
  onShareAccepted?: () => void;
}

export function SharingTab({ onShareAccepted }: SharingTabProps) {
  return <SharingCenter onShareAccepted={onShareAccepted} />;
}
