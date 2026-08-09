/**
 * MSW Handlers for better-auth endpoints
 *
 * Mock handlers for authentication API endpoints.
 */

import { http, HttpResponse } from "msw";
import { faker } from "@faker-js/faker";

const API_URL = "http://localhost:39291";

// Mock session data
export const mockSession = {
  user: {
    id: faker.string.uuid(),
    email: "test@example.com",
    name: "Test User",
    emailVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  session: {
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    token: faker.string.alphanumeric({ length: 64 }),
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
  },
};

export const authHandlers = [
  // Sign Up
  http.post(`${API_URL}/api/auth/sign-up/email`, async ({ request }) => {
    const body = (await request.json()) as {
      email: string;
      password: string;
      name: string;
    };

    // Simulate existing email
    if (body.email === "existing@example.com") {
      return HttpResponse.json(
        { error: { message: "User with this email already exists" } },
        { status: 400 },
      );
    }

    // Simulate weak password
    if (body.password.length < 8) {
      return HttpResponse.json(
        { error: { message: "Password must be at least 8 characters" } },
        { status: 400 },
      );
    }

    return HttpResponse.json(
      {
        user: {
          id: faker.string.uuid(),
          email: body.email,
          name: body.name,
          emailVerified: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        session: mockSession.session,
      },
      { status: 201 },
    );
  }),

  // Sign In
  http.post(`${API_URL}/api/auth/sign-in/email`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };

    // Simulate invalid credentials
    if (
      body.email === "invalid@example.com" ||
      body.password === "wrongpassword"
    ) {
      return HttpResponse.json(
        { error: { message: "Invalid credentials" } },
        { status: 401 },
      );
    }

    // Simulate unverified email
    if (body.email === "unverified@example.com") {
      return HttpResponse.json(
        { error: { message: "Please verify your email before signing in" } },
        { status: 403 },
      );
    }

    return HttpResponse.json({
      user: { ...mockSession.user, email: body.email },
      session: mockSession.session,
    });
  }),

  // Sign Out
  http.post(`${API_URL}/api/auth/sign-out`, () => {
    return HttpResponse.json({ success: true });
  }),

  // Get Session
  http.get(`${API_URL}/api/auth/get-session`, ({ request }) => {
    const cookie = request.headers.get("cookie");

    // Simulate no session
    if (!cookie || !cookie.includes("session")) {
      return HttpResponse.json({ session: null, user: null });
    }

    return HttpResponse.json(mockSession);
  }),

  // Email Verification
  http.post(`${API_URL}/api/auth/verify-email`, async ({ request }) => {
    const body = (await request.json()) as { token: string };

    if (body.token === "invalid-token") {
      return HttpResponse.json(
        { error: { message: "Invalid verification token" } },
        { status: 400 },
      );
    }

    return HttpResponse.json({ success: true, user: mockSession.user });
  }),

  // Resend Verification Email
  http.post(`${API_URL}/api/auth/send-verification-email`, () => {
    return HttpResponse.json({ success: true });
  }),
];

// Helper to create custom auth session
export function createMockSession(overrides: Partial<typeof mockSession> = {}) {
  return {
    ...mockSession,
    ...overrides,
    user: { ...mockSession.user, ...overrides.user },
    session: { ...mockSession.session, ...overrides.session },
  };
}
