// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Shared 401 handler.
 *
 * Clears the better-auth session (cookie + client state) and the
 * in-memory vault key before redirecting to /login.
 * A module-level flag prevents multiple parallel 401 responses
 * from racing each other.
 */

import { signOut } from "@/lib/auth/auth-client";
import { clearVaultKey } from "@/lib/vault-keys";
import { sessionStore } from "@/auth/sessionStore";
import { vaultKeyGate } from "@/auth/vaultKeyGate";

const AUTH_PAGES = ["/login", "/register"];

let isRedirecting = false;

export function handleUnauthorized(): void {
  if (isRedirecting) return;

  const path = window.location.pathname;
  if (AUTH_PAGES.some((p) => path.startsWith(p))) return;

  isRedirecting = true;

  // Clear sensitive in-memory data immediately
  clearVaultKey();
  vaultKeyGate.lock();

  // Sign out to clear session cookie + better-auth atom, then redirect
  signOut()
    .catch(() => {
      // Best-effort: if the server rejects (session already gone),
      // manually nuke the cookie so useSession() won't see it.
      document.cookie =
        "better-auth.session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    })
    .finally(() => {
      // Clear adapter-owned session state (Preferences on native, no-op on web)
      void sessionStore.clear().catch(() => undefined);
      window.location.href = "/login";
    });
}
