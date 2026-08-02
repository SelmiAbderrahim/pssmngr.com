// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Types for the GDPR data-export pipeline.
 *
 * The exported archive is **ciphertext only** — the server never sees
 * plaintext vault data. This is reflected in every type below: vault
 * item entries carry `ciphertext`, `nonce`, `authTag`, and a wrapped
 * data key, never plaintext credential fields.
 */

import type { DataExportFormat } from "../../db/schema/data-export";

export const BUNDLE_SCHEMA_VERSION = "2.0.0";

/** Stable identifier for the export-bundle format. Bump on breaking changes. */
export const BUNDLE_DEFAULT_EXPIRY_DAYS = 7;

/** Top-level manifest written to `manifest.json` in the bundle root. */
export interface BundleManifest {
	bundleSchemaVersion: string;
	generatedAt: string;
	userId: string;
	requestId: string;
	requestedFormat: DataExportFormat;
	/**
	 * Localized notice that the bundle contains ciphertext only and is
	 * decryptable solely with the user's master password inside a
	 * Password Manager client.
	 */
	zeroKnowledgeNotice: string;
}

/** Account section — non-secret profile metadata. NO password material. */
export interface AccountSection {
	id: string;
	email: string;
	name: string;
	createdAt: string | null;
	updatedAt: string | null;
	locale: string | null;
	preferences: {
		emailVerified: boolean;
		twoFactorEnabled: boolean;
	};
}

/** Session section — metadata for active sessions. NO tokens. */
export interface SessionSummary {
	id: string;
	createdAt: string | null;
	expiresAt: string | null;
	userAgent: string | null;
	ipAddress: string | null;
	impersonatedBy: string | null;
}

/** Vault metadata — encrypted blob fields preserved verbatim. */
export interface VaultSummary {
	id: string;
	name: string;
	organizationId: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	encryptedSearchIndex: string | null;
	encryptedWatchtowerState: string | null;
	kdfSalt: string;
	encryptedVerificationBlob: string | null;
}

/** Item — ciphertext-only export of a vault item. */
export interface VaultItemSummary {
	id: string;
	vaultId: string;
	itemType: string;
	ciphertext: string;
	nonce: string;
	authTag: string;
	wrappedDataKey: string;
	wrappedDataKeyNonce: string;
	wrappedDataKeyAuthTag: string;
	version: number;
	isFavorite: boolean;
	createdAt: string | null;
	updatedAt: string | null;
	deletedAt: string | null;
}

export interface ShareSummary {
	id: string;
	itemId: string;
	senderUserId: string;
	recipientUserId: string;
	wrappedKey: string;
	wrappedKeyNonce: string;
	wrappedKeyAuthTag: string;
	permission: string;
	expiresAt: string | null;
	accepted: boolean;
	revokedAt: string | null;
	createdAt: string | null;
}

export interface SecurityEventSummary {
	id: string;
	createdAt: string | null;
	userAgent: string | null;
	ipAddress: string | null;
	eventType: string;
}

export interface BundleSections {
	manifest: BundleManifest;
	account: AccountSection;
	sessions: SessionSummary[];
	vaults: VaultSummary[];
	items: VaultItemSummary[];
	folders: unknown[];
	sharedWithMe: ShareSummary[];
	sharedByMe: ShareSummary[];
	securityEvents: SecurityEventSummary[];
}
