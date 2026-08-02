// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Session-binding drift tests.
 *
 * History: Round 4 (fix #30) made IP/UA pinning hard-revoke the session row.
 * That locked out legitimate users — CGNAT/mobile IP rotation and benign UA
 * changes (browser auto-update, DevTools device emulation) deleted fresh
 * sessions on the first authenticated request after sign-in (2026-07-07 prod
 * incident). Binding drift is now DETECTION-ONLY: `validateRequest` logs the
 * drift (including both UA strings) but never rejects the request or deletes
 * the session. A cookie thief replays the victim's UA trivially, so the
 * equality check added ~no theft protection; vault data stays protected by
 * zero-knowledge encryption and sensitive ops by 2FA step-up.
 */

import type { IncomingMessage } from "node:http";
import { db } from "@pssmngr/server/db";
import { auth, validateRequest } from "@pssmngr/server/lib/auth";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

function makeRequest(ip: string, ua: string): IncomingMessage {
	return {
		headers: {
			cookie: "better-auth.session_token=stolen",
			"user-agent": ua,
			"x-real-ip": ip,
			"x-forwarded-for": ip,
		},
		socket: { remoteAddress: ip },
	} as unknown as IncomingMessage;
}

function mockSession(ip: string, ua: string) {
	return {
		session: {
			id: "sess-pinned",
			token: "tok-pinned",
			userId: "user-1",
			ipAddress: ip,
			userAgent: ua,
			activeOrganizationId: null,
		},
		user: { id: "user-1", email: "user-1@test.com" },
	};
}

let getSessionSpy: ReturnType<typeof vi.spyOn>;
let deleteSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
const whereMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
	getSessionSpy = vi.spyOn(auth.api, "getSession" as never);
	deleteSpy = vi
		.spyOn(db, "delete")
		.mockReturnValue({ where: whereMock } as never);
	vi.spyOn(db.query.member, "findFirst").mockResolvedValue(undefined as never);
	warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	whereMock.mockClear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("session binding drift is detection-only", () => {
	test("an IP-mismatched session survives (IP pinning removed for roaming/CGNAT clients)", async () => {
		getSessionSpy.mockResolvedValue(
			mockSession("1.2.3.4", "Mozilla/5.0") as never,
		);

		const result = await validateRequest(makeRequest("9.9.9.9", "Mozilla/5.0"));

		expect(result.session).not.toBeNull();
		expect(result.user).toMatchObject({ id: "user-1" });
		expect(deleteSpy).not.toHaveBeenCalled();
	});

	test("a UA-mismatched session survives but the drift is logged with both UA strings", async () => {
		getSessionSpy.mockResolvedValue(
			mockSession("1.2.3.4", "Mozilla/5.0") as never,
		);

		const result = await validateRequest(makeRequest("1.2.3.4", "Chrome/120"));

		expect(result.session).not.toBeNull();
		expect(result.user).toMatchObject({ id: "user-1" });
		expect(deleteSpy).not.toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("reason=ua_mismatch"),
		);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('storedUa="Mozilla/5.0"'),
		);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('currentUa="Chrome/120"'),
		);
	});

	test("a matching session passes through without any drift log", async () => {
		getSessionSpy.mockResolvedValue(
			mockSession("1.2.3.4", "Mozilla/5.0") as never,
		);

		const result = await validateRequest(makeRequest("1.2.3.4", "Mozilla/5.0"));

		expect(result.session).not.toBeNull();
		expect(result.user).toMatchObject({ id: "user-1", role: "member" });
		expect(deleteSpy).not.toHaveBeenCalled();
		expect(warnSpy).not.toHaveBeenCalledWith(
			expect.stringContaining("session binding drift"),
		);
	});
});
