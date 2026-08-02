// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { apiConfig, getCurrentLanguage } from "@/lib/api/config";
import { server } from "@tests/utils/mock-server";

describe("auth client", () => {
  it("sends cookies and the active locale when loading a session", async () => {
    let capturedLanguage: string | null = null;
    server.use(
      http.get(`${apiConfig.baseUrl}/api/auth/get-session`, ({ request }) => {
        capturedLanguage = request.headers.get("accept-language");
        return HttpResponse.json({ session: null, user: null });
      }),
    );

    const { authClient } = await import("@/lib/auth/auth-client");
    await authClient.getSession();

    expect(capturedLanguage).toBe(getCurrentLanguage());
    expect(apiConfig.credentials).toBe("include");
  });

  it("does not expose password-reset helpers", async () => {
    const auth = await import("@/lib/auth/auth-client");

    expect(auth).not.toHaveProperty("requestPasswordReset");
    expect(auth).not.toHaveProperty("resetPassword");
    expect(auth).not.toHaveProperty("changePassword");
  });
});
