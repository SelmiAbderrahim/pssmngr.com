// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import type { IncomingMessage } from "node:http";

/**
 * Validate that the current request's User-Agent matches the session.
 * Returns null if valid, or an error reason string if the session should be invalidated.
 *
 * IP pinning was removed 2026-07-07: strict IP equality revoked legitimate
 * sessions for CGNAT/mobile clients whose egress IP rotates between requests
 * (session deleted on the first authenticated call after sign-in → forced
 * logout). The recorded session.ipAddress is kept for session listing/audit
 * only. Session theft remains mitigated by HttpOnly+Secure cookies, UA
 * pinning, device trust, and 2FA step-up on sensitive operations.
 */
export function validateSessionBinding(
	session: { ipAddress?: string | null; userAgent?: string | null },
	req: IncomingMessage,
): string | null {
	const currentUa = req.headers["user-agent"] || "";

	// User-Agent pinning: reject if UA changed from session creation
	if (session.userAgent && currentUa !== session.userAgent) {
		return "ua_mismatch";
	}

	return null;
}
