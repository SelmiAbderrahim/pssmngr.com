// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import http from "node:http";
import { initI18n, SUPPORTED_LANGUAGES } from "@pssmngr/server";
import { initializeDataExportJobs } from "@pssmngr/server/jobs";
import { validateEnv } from "@pssmngr/server/lib/env-validation";
import { getRedisClient } from "@pssmngr/server/utils/redis";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import next from "next";
import { handleCorsPreflight } from "@/server/cors";
import { handleDataExportDownload } from "@/server/data-export-download";
import { db } from "@/server/db";
import { migration } from "@/server/db/migration";

config({ path: ".env" });
validateEnv();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";

// Initialize i18n for server-side translations
initI18n()
	.then(() => {
		console.log(
			`✅ i18n initialized with languages: ${SUPPORTED_LANGUAGES.join(", ")}`,
		);
	})
	.catch((err: unknown) => {
		console.error("❌ Failed to initialize i18n:", err);
	});

const app = next({ dev, turbopack: process.env.TURBOPACK === "1" });
const handle = app.getRequestHandler();
void app.prepare().then(async () => {
	try {
		const server = http.createServer((req, res) => {
			const pathname = (req.url ?? "/").split("?")[0] ?? "/";
			if (pathname === "/healthz") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ status: "ok" }));
				return;
			}
			if (pathname === "/readyz") {
				void Promise.all([db.execute(sql`select 1`), getRedisClient().ping()])
					.then(() => {
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ status: "ready" }));
					})
					.catch(() => {
						res.writeHead(503, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ status: "unavailable" }));
					});
				return;
			}
			if (handleCorsPreflight(req, res)) {
				return;
			}
			// GDPR data-export download — token-gated binary stream.
			// Lives outside tRPC so the email link works pasted into any
			// browser without the user's cookie. Cheap prefix check
			// avoids paying for an async dispatch on every request.
			if (pathname.startsWith("/data-export/download/")) {
				void handleDataExportDownload(req, res).catch((err) => {
					console.error("[data-export-download] unexpected error", err);
					if (!res.headersSent) {
						res.statusCode = 500;
						res.end();
					}
				});
				return;
			}
			handle(req, res);
		});

		if (process.env.NODE_ENV === "production") {
			await migration();
		}

		// GDPR data-export scheduled jobs (expire + purge + crash
		// recovery). Idempotent: re-invoking cancels the previous
		// timers first.
		try {
			initializeDataExportJobs();
		} catch (err) {
			console.error("Data-export job bootstrap failed (non-fatal):", err);
		}

		server.listen(PORT, HOST);
		console.log(`Server Started on: http://${HOST}:${PORT}`);
	} catch (e) {
		console.error("Main Server Error", e);
	}
});
