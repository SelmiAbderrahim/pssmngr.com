// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL!;

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

export const migration = async () =>
	await migrate(db, { migrationsFolder: "drizzle" })
		.then(() => {
			console.log("Migration complete");
		})
		.catch((error) => {
			// A schema the code doesn't expect is worse than a crash: fail the
			// boot instead of running with silently-unapplied migrations.
			// exit() rather than throw — server.ts wraps startup in a catch-all
			// that would swallow a throw and leave a process that never listens.
			console.error("Migration failed", error);
			process.exit(1);
		})
		.finally(() => {
			sql.end();
		});
