// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Canonical public URL of this deployment.
 *
 * Used to build links that are sent to users (invitations, notification deep
 * links). Falls back through the auth/app URLs before landing on the local dev
 * default, so a self-hosted install only has to set one of them.
 */
export const WEBSITE_URL =
	process.env.WEBSITE_URL ||
	process.env.BETTER_AUTH_URL ||
	process.env.APP_URL ||
	"http://localhost:42789";
