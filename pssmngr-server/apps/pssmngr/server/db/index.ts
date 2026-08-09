// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
	var db: PostgresJsDatabase<typeof schema> | undefined;
}

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
	throw new Error("DATABASE_URL is required");
}

export let db: PostgresJsDatabase<typeof schema>;
if (process.env.NODE_ENV === "production") {
	db = drizzle(postgres(dbUrl!), {
		schema,
	});
} else {
	if (!global.db)
		global.db = drizzle(postgres(dbUrl!), {
			schema,
		});

	db = global.db;
}
