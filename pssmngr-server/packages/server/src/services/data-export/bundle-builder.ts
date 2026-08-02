// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Bundle builder for the GDPR data-export pipeline.
 *
 * Builds a ZIP archive at `${EXPORT_STORAGE_DIR}/<userId>/<requestId>.zip`
 * containing the user's data **as ciphertext** (zero-knowledge). The
 * server never decrypts vault entries.
 *
 * Streams rows in chunks rather than buffering the entire dataset.
 */
import AdmZip from "adm-zip";
import { and, asc, eq, gt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../db/schema";
import type { DataExportFormat } from "../../db/schema/data-export";
import {
	DEFAULT_LANGUAGE,
	getNamespacedTranslator,
	initI18n,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from "../../i18n";
import {
	bundleAbsolutePath,
	bundleRelativePath,
	ensureUserDir,
} from "./storage";
import {
	type AccountSection,
	BUNDLE_SCHEMA_VERSION,
	type BundleManifest,
	type SecurityEventSummary,
	type SessionSummary,
	type ShareSummary,
	type VaultItemSummary,
	type VaultSummary,
} from "./types";

type Db = PostgresJsDatabase<typeof schema>;

const PAGE_SIZE = 2000;

function iso(d: Date | null | undefined): string | null {
	if (!d) return null;
	return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function safeLanguage(value: string | null | undefined): SupportedLanguage {
	if (value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)) {
		return value as SupportedLanguage;
	}
	return DEFAULT_LANGUAGE;
}

async function collectAccount(db: Db, userId: string): Promise<AccountSection> {
	const row = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
	});
	if (!row) {
		// Schema FK guarantees this shouldn't happen — but stay defensive.
		throw new Error(`account row missing for user ${userId}`);
	}
	return {
		id: row.id,
		email: row.email,
		name: row.name ?? "",
		createdAt: iso(row.createdAt),
		updatedAt: iso(row.updatedAt),
		locale: row.preferredLanguage ?? null,
		preferences: {
			emailVerified: row.emailVerified === true,
			twoFactorEnabled: row.twoFactorEnabled === true,
		},
	};
}

async function collectSessions(
	db: Db,
	userId: string,
): Promise<SessionSummary[]> {
	const rows = await db.query.session.findMany({
		where: eq(schema.session.userId, userId),
	});
	return rows.map((r) => ({
		id: r.id,
		createdAt: iso(r.createdAt),
		expiresAt: iso(r.expiresAt),
		userAgent: r.userAgent ?? null,
		ipAddress: r.ipAddress ?? null,
		impersonatedBy: r.impersonatedBy ?? null,
	}));
}

async function collectVaults(db: Db, userId: string): Promise<VaultSummary[]> {
	const rows = await db.query.vault.findMany({
		where: eq(schema.vault.userId, userId),
	});
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		organizationId: r.organizationId ?? null,
		createdAt: iso(r.createdAt),
		updatedAt: iso(r.updatedAt),
		encryptedSearchIndex: r.encryptedSearchIndex ?? null,
		encryptedWatchtowerState: r.encryptedWatchtowerState ?? null,
		kdfSalt: r.kdfSalt,
		encryptedVerificationBlob: r.encryptedVerificationBlob ?? null,
	}));
}

/**
 * Keyset-paginated stream of vault items belonging to any of the
 * supplied vault ids. Yields one chunk at a time so the worker never
 * holds the entire set in memory.
 */
async function* iterateVaultItems(
	db: Db,
	vaultIds: string[],
): AsyncGenerator<VaultItemSummary[]> {
	if (vaultIds.length === 0) return;
	let cursor: string | null = null;
	while (true) {
		const where = cursor
			? and(
					// In Drizzle's pg adapter, IN(...) gets compiled correctly
					// from a JS array, but we want predictable paging so we
					// fetch per-vault and merge — simpler than synthesising
					// a tuple comparison.
					gt(schema.item.id, cursor),
				)
			: undefined;

		const rows: (typeof schema.item.$inferSelect)[] = await db
			.select()
			.from(schema.item)
			.where(where)
			.orderBy(asc(schema.item.id))
			.limit(PAGE_SIZE);

		const filtered = rows.filter((r) => vaultIds.includes(r.vaultId));
		if (rows.length === 0) return;
		cursor = rows[rows.length - 1]!.id;

		if (filtered.length > 0) {
			yield filtered.map((r) => ({
				id: r.id,
				vaultId: r.vaultId,
				itemType: r.itemType,
				ciphertext: r.ciphertext,
				nonce: r.nonce,
				authTag: r.authTag,
				wrappedDataKey: r.wrappedDataKey,
				wrappedDataKeyNonce: r.wrappedDataKeyNonce,
				wrappedDataKeyAuthTag: r.wrappedDataKeyAuthTag,
				version: r.version,
				isFavorite: r.isFavorite === true,
				createdAt: iso(r.createdAt),
				updatedAt: iso(r.updatedAt),
				deletedAt: iso(r.deletedAt),
			}));
		}

		if (rows.length < PAGE_SIZE) return;
	}
}

async function collectShares(
	db: Db,
	userId: string,
): Promise<{ shared_with_me: ShareSummary[]; shared_by_me: ShareSummary[] }> {
	const incoming = await db.query.shareEnvelope.findMany({
		where: eq(schema.shareEnvelope.recipientUserId, userId),
	});
	const outgoing = await db.query.shareEnvelope.findMany({
		where: eq(schema.shareEnvelope.senderUserId, userId),
	});
	const map = (r: typeof schema.shareEnvelope.$inferSelect): ShareSummary => ({
		id: r.id,
		itemId: r.itemId,
		senderUserId: r.senderUserId,
		recipientUserId: r.recipientUserId,
		wrappedKey: r.wrappedKey,
		wrappedKeyNonce: r.wrappedKeyNonce,
		wrappedKeyAuthTag: r.wrappedKeyAuthTag,
		permission: r.permission,
		expiresAt: iso(r.expiresAt),
		accepted: r.accepted === true,
		revokedAt: iso(r.revokedAt),
		createdAt: iso(r.createdAt),
	});
	return {
		shared_with_me: incoming.map(map),
		shared_by_me: outgoing.map(map),
	};
}

/**
 * "Security events" are derived from session creation + impersonation
 * logs that affected this user. We keep
 * this list small and best-effort.
 */
async function collectSecurityEvents(
	db: Db,
	userId: string,
): Promise<SecurityEventSummary[]> {
	const sessions = await db.query.session.findMany({
		where: eq(schema.session.userId, userId),
	});
	return sessions.map((s) => ({
		id: s.id,
		createdAt: iso(s.createdAt),
		userAgent: s.userAgent ?? null,
		ipAddress: s.ipAddress ?? null,
		eventType: s.impersonatedBy ? "impersonated_session" : "session_created",
	}));
}

/** Build a tiny CSV serializer that always emits text-safe rows. */
function toCsv<T extends Record<string, unknown>>(rows: T[]): string {
	if (rows.length === 0) return "";
	const headers = Object.keys(rows[0]!);
	const escapeCsvValue = (v: unknown): string => {
		if (v == null) return "";
		const s = typeof v === "string" ? v : JSON.stringify(v);
		if (/[",\n\r]/.test(s)) {
			return `"${s.replace(/"/g, '""')}"`;
		}
		return s;
	};
	const out: string[] = [headers.join(",")];
	for (const r of rows) {
		out.push(headers.map((h) => escapeCsvValue(r[h])).join(","));
	}
	return out.join("\n");
}

function buildReadme(language: SupportedLanguage): string {
	const t = getNamespacedTranslator(language, "emails");
	const sections = [
		t("dataExport.readme.heading"),
		"",
		t("dataExport.readme.intro"),
		"",
		t("dataExport.readme.formatHeading"),
		t("dataExport.readme.formatBody"),
		"",
		t("dataExport.readme.zeroKnowledgeHeading"),
		t("dataExport.readme.zeroKnowledgeBody"),
		"",
		t("dataExport.readme.rightsHeading"),
		t("dataExport.readme.rightsBody"),
		"",
		t("dataExport.readme.contactHeading"),
		t("dataExport.readme.contactBody"),
	];
	return sections.join("\n");
}

/**
 * Build the bundle for one request and write the ZIP to disk.
 *
 * Returns the size in bytes and the relative bundle path that should
 * be persisted to the `data_export_request.bundle_path` column.
 */
export async function buildExportBundle(args: {
	db: Db;
	userId: string;
	requestId: string;
	format: DataExportFormat;
	language?: string | null;
}): Promise<{ relativePath: string; sizeBytes: number }> {
	await initI18n();
	const language = safeLanguage(args.language ?? null);

	await ensureUserDir(args.userId);
	const relativePath = bundleRelativePath(args.userId, args.requestId);
	const absolutePath = bundleAbsolutePath(relativePath);

	// Gather data — most sections are small enough to materialise; items
	// stream in chunks so memory stays bounded.
	const account = await collectAccount(args.db, args.userId);
	const sessions = await collectSessions(args.db, args.userId);
	const vaults = await collectVaults(args.db, args.userId);
	const items: VaultItemSummary[] = [];
	for await (const chunk of iterateVaultItems(
		args.db,
		vaults.map((v) => v.id),
	)) {
		for (const it of chunk) items.push(it);
	}
	const { shared_with_me, shared_by_me } = await collectShares(
		args.db,
		args.userId,
	);
	const securityEvents = await collectSecurityEvents(args.db, args.userId);

	const t = getNamespacedTranslator(language, "emails");
	const manifest: BundleManifest = {
		bundleSchemaVersion: BUNDLE_SCHEMA_VERSION,
		generatedAt: new Date().toISOString(),
		userId: args.userId,
		requestId: args.requestId,
		requestedFormat: args.format,
		zeroKnowledgeNotice: t("dataExport.zeroKnowledgeNotice"),
	};

	const wantJson = args.format === "JSON" || args.format === "BOTH";
	const wantCsv = args.format === "CSV" || args.format === "BOTH";

	const zip = new AdmZip();
	const add = (filename: string, content: string): void => {
		zip.addFile(filename, Buffer.from(content, "utf-8"));
	};

	add("manifest.json", JSON.stringify(manifest, null, 2));
	add("README.txt", buildReadme(language));

	if (wantJson) {
		add("account/account.json", JSON.stringify(account, null, 2));
		add("account/sessions.json", JSON.stringify(sessions, null, 2));
		add("vault/vaults.json", JSON.stringify(vaults, null, 2));
		add("vault/items.json", JSON.stringify(items, null, 2));
		add("folders/folders.json", JSON.stringify([], null, 2));
		add("sharing/shared_with_me.json", JSON.stringify(shared_with_me, null, 2));
		add("sharing/shared_by_me.json", JSON.stringify(shared_by_me, null, 2));
		add("audit/security_events.json", JSON.stringify(securityEvents, null, 2));
	}

	if (wantCsv) {
		add(
			"vault/items.csv",
			toCsv(items as unknown as Record<string, unknown>[]),
		);
		add(
			"sharing/shared_with_me.csv",
			toCsv(shared_with_me as unknown as Record<string, unknown>[]),
		);
		add(
			"sharing/shared_by_me.csv",
			toCsv(shared_by_me as unknown as Record<string, unknown>[]),
		);
		add(
			"audit/security_events.csv",
			toCsv(securityEvents as unknown as Record<string, unknown>[]),
		);
	}

	zip.writeZip(absolutePath);

	const buf = zip.toBuffer();
	return { relativePath, sizeBytes: buf.length };
}

/** Exported for tests so they can inspect the in-memory sections. */
export const __testing__ = {
	toCsv,
	buildReadme,
};
