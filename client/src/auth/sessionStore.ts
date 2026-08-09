// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Web session adapter.
 *
 * Better Auth owns the session in an HttpOnly cookie. Client JavaScript must
 * never copy the token into localStorage, IndexedDB, or another readable store.
 */

export interface SessionStore {
  getSessionToken(): Promise<string | null>;
  setSessionToken(token: string | null): Promise<void>;
  clear(): Promise<void>;
}

export class WebSessionStore implements SessionStore {
  async getSessionToken(): Promise<null> {
    return null;
  }

  async setSessionToken(_token: string | null): Promise<void> {
    // The browser's HttpOnly cookie is the only supported session store.
    void _token;
  }

  async clear(): Promise<void> {
    // Cookie eviction is handled by the Better Auth sign-out endpoint.
  }
}

/** Compatibility for the request wrapper; web requests use credentials. */
export function getAccessContext(): Readonly<{ authHeader?: string }> {
  return {};
}

export const sessionStore: SessionStore = new WebSessionStore();
