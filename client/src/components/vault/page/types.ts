// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * ActiveDialog — the single discriminated union replacing every dialog
 * boolean previously scattered across vault.tsx.
 *
 * Opening one dialog closes any other by construction: only a single
 * value of this union can be set at a time.
 */

import type { OTPAuthURI } from "@/services/totp-engine";
import type { CreateType } from "./utils";

export type ActiveDialog =
  | { kind: "none" }
  | { kind: "createItem"; itemType?: CreateType }
  | { kind: "qrScanner" }
  | { kind: "totpPreview"; uri: OTPAuthURI }
  | { kind: "share"; itemId: string }
  | { kind: "unlock" };
