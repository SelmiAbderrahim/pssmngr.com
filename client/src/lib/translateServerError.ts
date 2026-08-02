// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import i18next from "i18next";

/**
 * Translates a server error message that may be a raw i18n key.
 *
 * When backend i18n fails (e.g., not yet initialized), error messages
 * arrive as raw keys like "auth.adminAlreadyExists" instead of
 * "Admin account already exists". This checks if the message is a
 * known error key and translates it client-side.
 */
export function translateServerError(message: string): string {
	const retryAfterMatch = message.match(/try again in (\d+) seconds/i);
	if (retryAfterMatch && i18next.exists("errors:auth.rateLimited")) {
		return i18next.t("errors:auth.rateLimited", {
			seconds: retryAfterMatch[1],
		});
	}

	if (/too many requests/i.test(message) && i18next.exists("errors:auth.tooManyRequests")) {
		return i18next.t("errors:auth.tooManyRequests");
	}

	const namespacedKey = `errors:${message}`;
	if (i18next.exists(namespacedKey)) {
		return i18next.t(namespacedKey);
	}
	return message;
}
