// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Security Types
 *
 * TypeScript types for security features including:
 * - Two-Factor Authentication (2FA)
 * - Active Sessions management
 * - Connected Accounts (OAuth)
 * - Password management
 *
 * @module types/security
 */

import { z } from "zod";

// =============================================================================
// Two-Factor Authentication Types
// =============================================================================

/**
 * 2FA setup response with secret and QR code
 */
export interface TwoFactorSetup {
  /** Base32 encoded secret key */
  secret: string;
  /** QR code URL for scanning with authenticator app */
  qrCodeUrl: string;
  /** Backup codes for recovery (only provided on initial setup) */
  backupCodes?: string[];
  /** Account name for the authenticator app */
  accountName?: string;
  /** Issuer name for the authenticator app */
  issuer?: string;
}

/**
 * 2FA status response
 */
export interface TwoFactorStatus {
  /** Whether 2FA is enabled */
  enabled: boolean;
  /** Whether backup codes have been viewed/saved */
  backupCodesSaved?: boolean;
  /** Number of remaining backup codes */
  remainingBackupCodes?: number;
  /** Date 2FA was enabled */
  enabledAt?: string;
}

/**
 * Backup codes response
 */
export interface BackupCodes {
  /** Array of backup codes */
  codes: string[];
  /** When the codes were generated */
  generatedAt: string;
  /** Number of codes used */
  usedCount: number;
  /** Total number of codes */
  totalCount: number;
}

// =============================================================================
// Session Management Types
// =============================================================================

/**
 * Active session information
 */
export interface Session {
  /** Unique session identifier */
  id: string;
  /** User agent string from the browser/device */
  userAgent: string;
  /** IP address of the session */
  ipAddress: string;
  /** When the session was created */
  createdAt: string;
  /** Last activity timestamp */
  lastActiveAt: string;
  /** Whether this is the current session */
  isCurrent: boolean;
  /** Parsed device information */
  device?: {
    type: "desktop" | "mobile" | "tablet" | "unknown";
    browser?: string;
    os?: string;
  };
  /** Geolocation information (if available) */
  location?: {
    city?: string;
    country?: string;
    countryCode?: string;
  };
}

/**
 * Sessions list response
 */
export interface SessionsResponse {
  /** List of active sessions */
  sessions: Session[];
  /** Total number of sessions */
  total: number;
}

// =============================================================================
// Form Validation Schemas
// =============================================================================

/**
 * 2FA verification code schema
 */
export const verify2FASchema = z.object({
  code: z
    .string()
    .length(6, "Code must be 6 digits")
    .regex(/^\d+$/, "Code must be numeric"),
});

export type Verify2FAInput = z.infer<typeof verify2FASchema>;

/**
 * Backup code verification schema
 */
export const verifyBackupCodeSchema = z.object({
  code: z
    .string()
    .min(8, "Backup code is required")
    .regex(/^[A-Za-z0-9-]+$/, "Invalid backup code format"),
});

export type VerifyBackupCodeInput = z.infer<typeof verifyBackupCodeSchema>;

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Generic security operation response
 */
export interface SecurityOperationResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * 2FA enable response
 */
export interface Enable2FAResponse extends SecurityOperationResult {
  setup?: TwoFactorSetup;
}

/**
 * 2FA verify response
 */
export interface Verify2FAResponse extends SecurityOperationResult {
  backupCodes?: string[];
}

/**
 * Session revoke response
 */
export interface RevokeSessionResponse extends SecurityOperationResult {
  revokedSessionId?: string;
}

// =============================================================================
// Security Settings Types
// =============================================================================

/**
 * Security settings state
 */
export interface SecuritySettings {
  twoFactorEnabled: boolean;
  passwordLastChanged?: string;
  connectedAccountsCount: number;
  activeSessionsCount: number;
}

/**
 * Security audit log entry
 */
export interface SecurityAuditEntry {
  id: string;
  action:
    | "password_changed"
    | "2fa_enabled"
    | "2fa_disabled"
    | "session_revoked"
    | "account_connected"
    | "account_disconnected"
    | "login_success"
    | "login_failed";
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}
