// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Database Schema - pssmngr
 *
 * User Authentication:
 *   user → session, account, verification, twoFactor
 *   organization → member, invitation
 *
 * Vault System:
 *   user → vault → item → item_version
 *                       → password_history
 *   user → device
 *   item → share_envelope (sender, recipient)
 */

// Existing schemas
export * from "./account";
// Data-export requests
export * from "./data-export";
// Vault schemas
export * from "./device";
// Emergency-access schemas
export * from "./emergency";
// Offline-sync idempotency keys
export * from "./idempotency";
export * from "./item";
export * from "./notification";
// Passkey schema
export * from "./passkey";

// Recovery schemas
export * from "./recovery";
export * from "./session";
export * from "./share";
// Shared-vault schemas
export * from "./shared-vault";
export * from "./user";
export * from "./vault";
