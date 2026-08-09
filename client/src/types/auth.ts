// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Centralized authentication state types
 * Used by AuthProvider to coordinate auth state across the application
 */

import { User } from "./";

export type AuthStatus =
  | "loading" // Initial auth check in progress
  | "unauthenticated" // No active session
  | "authenticated" // Has session + username
  | "onboarding"; // Has session, needs username

export type OnboardingStep = "username" | "email_verification" | "complete";

export interface AuthState {
  // Core authentication state
  status: AuthStatus;
  user: User | null;
  isLoading: boolean;

  // Onboarding state - coordination flag to prevent race conditions
  onboardingStep: OnboardingStep | null;
  isPendingOnboarding: boolean; // Prevents auth guard from redirecting during mutation

  // Navigation decision helpers
  shouldRedirectToOnboarding: boolean;
  shouldRedirectToDashboard: boolean;

  // Actions
  setPendingOnboarding: (pending: boolean) => void;
  refreshUser: () => void;
}

export interface AuthContextValue extends AuthState {
  // Internal state for mutation coordination
  _mutationTimestamp: number | null;
  _setMutationTimestamp: (timestamp: number | null) => void;
}
