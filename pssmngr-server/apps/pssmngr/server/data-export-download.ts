// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Token-gated HTTP download route for GDPR data-export bundles.
 *
 * Route: `GET /data-export/download/<token>`
 *
 *  - The token is the SOLE authorization. It is never tied to a
 *    cookie/session because the email link must work in any browser.
 *  - The token is a 256-bit random value, sent only via the success
 *    email, and stored as-is (possession = authorization).
 *  - Expired or revoked rows return HTTP 410 Gone with a localized
 *    message.
 *  - Other tokens (typos, expired-but-not-yet-swept rows) → 404.
 *  - Streams the file from disk; never buffers in memory.
 *
 * NOTE: this is a custom-server handler, NOT a tRPC procedure.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
	DEFAULT_LANGUAGE,
	getEffectiveLanguage,
	getNamespacedTranslator,
	initI18n,
	type SupportedLanguage,
} from "@pssmngr/server";
import { db } from "@pssmngr/server/db";
import {
	bundleAbsolutePathFor,
	findByDownloadToken,
	recordDownload,
} from "@pssmngr/server/services/data-export";

const ROUTE_PREFIX = "/data-export/download/";

function pickLanguage(req: IncomingMessage): SupportedLanguage {
	const accept = req.headers["accept-language"];
	const lang = getEffectiveLanguage({
		userPreference: undefined,
		acceptLanguage: typeof accept === "string" ? accept : undefined,
	});
	return (lang as SupportedLanguage) ?? DEFAULT_LANGUAGE;
}

async function send(
	res: ServerResponse,
	status: number,
	body: string | Buffer,
	contentType = "text/plain; charset=utf-8",
): Promise<void> {
	if (res.headersSent) return;
	res.statusCode = status;
	res.setHeader("Content-Type", contentType);
	res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
	res.setHeader("Pragma", "no-cache");
	res.setHeader("Referrer-Policy", "no-referrer");
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.end(body);
}

/**
 * Returns true if the request was handled here. Returning true tells
 * the custom server to stop processing.
 */
export async function handleDataExportDownload(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<boolean> {
	if (req.method !== "GET" && req.method !== "HEAD") {
		return false;
	}
	const url = (req.url ?? "/").split("?")[0] ?? "/";
	if (!url.startsWith(ROUTE_PREFIX)) {
		return false;
	}

	const token = decodeURIComponent(url.slice(ROUTE_PREFIX.length));
	await initI18n().catch(() => undefined);
	const language = pickLanguage(req);
	const t = getNamespacedTranslator(language, "errors");

	if (!token || token.length < 16) {
		await send(res, 404, t("dataExport.notFound"));
		return true;
	}

	const row = await findByDownloadToken(db, token);
	if (!row) {
		await send(res, 404, t("dataExport.notFound"));
		return true;
	}

	// Defensive expiry check — the sweeper runs hourly so a row may
	// still be SUCCEEDED but past expiresAt.
	if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
		await send(res, 410, t("dataExport.expired"));
		return true;
	}

	const absolutePath = bundleAbsolutePathFor(row);
	if (!absolutePath) {
		await send(res, 410, t("dataExport.revoked"));
		return true;
	}

	let size = 0;
	try {
		const s = await stat(absolutePath);
		size = s.size;
	} catch {
		// File missing on disk even though row is SUCCEEDED — treat
		// as gone.
		await send(res, 410, t("dataExport.revoked"));
		return true;
	}

	const filename = `pssmngr-export-${row.id}.zip`;
	res.statusCode = 200;
	res.setHeader("Content-Type", "application/zip");
	res.setHeader("Content-Length", String(size));
	res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
	res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
	res.setHeader("X-Content-Type-Options", "nosniff");

	if (req.method === "HEAD") {
		res.end();
		await recordDownload({ db, requestId: row.id });
		return true;
	}

	const stream = createReadStream(absolutePath);
	stream.on("error", () => {
		// Stream errors after headers are sent — best we can do is
		// terminate.
		try {
			res.destroy();
		} catch {
			/* noop */
		}
	});
	stream.pipe(res);
	await new Promise<void>((resolve) => {
		res.on("close", resolve);
		res.on("finish", resolve);
	});
	await recordDownload({ db, requestId: row.id }).catch(() => undefined);
	return true;
}

/** Test seam: expose the route prefix for unit tests. */
export const DATA_EXPORT_DOWNLOAD_PREFIX = ROUTE_PREFIX;
