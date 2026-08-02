// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = process.env.NODE_ENV === "development";

export const logger = pino({
	level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
	redact: {
		paths: [
			"masterPassword",
			"password",
			"newPassword",
			"currentPassword",
			"privateKey",
			"secretKey",
			"publicKey",
			"token",
			"sessionToken",
			"refreshToken",
			"accessToken",
			"authorization",
			"cookie",
			"cookies",
			"apiKey",
			"api_key",
			"keystorePassword",
			"encryptionKey",
			"derivedKey",
			"vaultKey",
			"req.headers.authorization",
			"req.headers.cookie",
			'res.headers["set-cookie"]',
			"*.password",
			"*.token",
			"*.secret",
			"*.apiKey",
		],
		censor: "[REDACTED]",
	},
	...(isDevelopment
		? {
				transport: {
					target: "pino-pretty",
					options: {
						colorize: true,
						levelFirst: false,
					},
				},
			}
		: {}),
});
