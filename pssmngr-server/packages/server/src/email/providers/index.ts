// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Email Providers Index
 *
 * Exports all email provider implementations.
 */

export { BaseEmailProvider } from "./base";
export { ResendProvider } from "./resend";
export { SmtpProvider, type SmtpProviderConfig } from "./smtp";
