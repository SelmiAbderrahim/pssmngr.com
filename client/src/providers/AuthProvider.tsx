// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Centralized Auth State Provider
 *
 * Uses better-auth for authentication.
 * Provides session state and user info across the application.
 */

import React, { createContext, useContext, useCallback, useState } from "react";
import { AuthState, AuthContextValue } from "@/types/auth";
import { useSession } from "@/lib/auth";
import { setDeviceKeyScope } from "@/lib/device-keys";
import { vaultCrypto } from "@/services/vault-crypto";
import { clearSharedVaultKeys } from "@/services/shared-vault-crypto";
import { clearPersistence as clearPersistentUnlock } from "@/lib/persistent-unlock";
import type { User } from "@/types";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { data: session, isPending, refetch } = useSession();
  const [isPendingOnboarding, setIsPendingOnboarding] = useState(false);
  const [mutationTimestamp, setMutationTimestamp] = useState<number | null>(null);
  const previousUserEmailRef = React.useRef<string | null>(null);

  // Map better-auth session to our User type
  const user: User | null = session?.user
    ? {
        _id: session.user.id,
        id: session.user.id,
        email: session.user.email,
        name: session.user.name || undefined,
        username: session.user.name || undefined,
        avatarUrl: session.user.image || undefined,
        emailVerificationTime: session.user.emailVerified ? Date.now() : undefined,
        createdAt: session.user.createdAt ? new Date(session.user.createdAt).getTime() : Date.now(),
        authProvider: "password" as const,
        role: (session.user as { role?: string }).role as User["role"],
      }
    : null;

  // Determine auth status
  const status = isPending
    ? "loading"
    : session?.user
      ? "authenticated"
      : "unauthenticated";

  React.useEffect(() => {
    if (status === "loading") return;

    const currentEmail = user?.email?.trim().toLowerCase() ?? null;
    const previousEmail = previousUserEmailRef.current;

    setDeviceKeyScope(currentEmail);

    if (previousEmail && previousEmail !== currentEmail) {
      clearSharedVaultKeys();
      vaultCrypto.lock({ forget: true });
      void clearPersistentUnlock();
    }

    previousUserEmailRef.current = currentEmail;
  }, [status, user?.email]);

  const refreshUser = useCallback(() => {
    refetch();
  }, [refetch]);

  const value: AuthContextValue = {
    status,
    user,
    isLoading: isPending,
    onboardingStep: null,
    isPendingOnboarding,
    shouldRedirectToOnboarding: false,
    shouldRedirectToDashboard: status === "authenticated",
    setPendingOnboarding: setIsPendingOnboarding,
    refreshUser,
    _mutationTimestamp: mutationTimestamp,
    _setMutationTimestamp: setMutationTimestamp,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access centralized auth state
 */
export function useAuthState(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthState must be used within AuthProvider");
  }
  return context;
}

export { AuthContext };
