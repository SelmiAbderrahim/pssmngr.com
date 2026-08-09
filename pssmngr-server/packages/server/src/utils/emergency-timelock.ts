// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Emergency Access Time-Lock Signing
 *
 * HMAC-SHA256 signing of timestamps so clients cannot forge or manipulate
 * the request/expiry times. Uses the server's ENCRYPTION_KEY as the secret.
 *
 * @module @pssmngr/server/utils/emergency-timelock
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const HMAC_ALGORITHM = "sha256";
const SIGNING_CONTEXT = "pssmngr-emergency-timelock-v1";

/** Cooldown period after a denial (24 hours in ms). */
export const DENIAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function getSigningKey(): string {
	const key = process.env.ENCRYPTION_KEY;
	if (!key || key.length < 32) {
		throw new Error(
			"ENCRYPTION_KEY (>=32 chars) is required for emergency time-lock signing",
		);
	}
	return key;
}

/**
 * Build the canonical message that gets signed.
 * Includes request ID, timestamps, and waiting period to prevent any field swap.
 */
function buildMessage(
	requestId: string,
	requestedAt: Date,
	expiresAt: Date,
	waitingPeriodDays: number,
): string {
	return [
		SIGNING_CONTEXT,
		requestId,
		requestedAt.toISOString(),
		expiresAt.toISOString(),
		String(waitingPeriodDays),
	].join("|");
}

/**
 * Sign a time-lock request, producing an HMAC-SHA256 hex digest.
 */
export function signTimestamp(
	requestId: string,
	requestedAt: Date,
	expiresAt: Date,
	waitingPeriodDays: number,
): string {
	const message = buildMessage(
		requestId,
		requestedAt,
		expiresAt,
		waitingPeriodDays,
	);
	return createHmac(HMAC_ALGORITHM, getSigningKey())
		.update(message)
		.digest("hex");
}

/**
 * Verify a previously-signed time-lock using constant-time comparison.
 * Returns true only if the signature is valid.
 */
export function verifyTimestamp(
	requestId: string,
	requestedAt: Date,
	expiresAt: Date,
	waitingPeriodDays: number,
	signature: string,
): boolean {
	const expected = signTimestamp(
		requestId,
		requestedAt,
		expiresAt,
		waitingPeriodDays,
	);

	if (expected.length !== signature.length) {
		return false;
	}

	return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
