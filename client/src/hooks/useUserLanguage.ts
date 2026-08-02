// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useUserLanguage Hook
 *
 * React Query hooks for user language preferences.
 * Handles fetching and updating language preference in database.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LanguageService } from "@/services/deployment/languageService";
import type { SupportedLanguage } from "@/i18n";
import { useAuthState } from "@/providers/AuthProvider";

/**
 * Query key factory for language preferences
 */
export const languageKeys = {
  all: ["language"] as const,
  preference: () => [...languageKeys.all, "preference"] as const,
};

/**
 * Hook to fetch user's language preference from database
 * Only fetches when user is authenticated
 */
export function useUserLanguagePreference() {
  const { status } = useAuthState();
  const isAuthenticated = status === "authenticated";

  return useQuery({
    queryKey: languageKeys.preference(),
    queryFn: () => LanguageService.getPreferredLanguage(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes - allow refetch if stale
    gcTime: 60 * 60 * 1000, // 1 hour - reduced from 24 hours
    retry: 1, // Only retry once on failure
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });
}

/**
 * Hook to update user's language preference in database
 * Uses optimistic updates to prevent race conditions when user changes language
 */
export function useUpdateUserLanguage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (language: SupportedLanguage) =>
      LanguageService.updatePreferredLanguage(language),
    onMutate: async (newLanguage) => {
      // Cancel any outgoing refetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: languageKeys.preference() });

      // Snapshot the previous value for rollback
      const previousLanguage = queryClient.getQueryData<string>(languageKeys.preference());

      // Optimistically update to the new value immediately
      queryClient.setQueryData(languageKeys.preference(), newLanguage);

      return { previousLanguage };
    },
    onError: (_err, _newLanguage, context) => {
      // Rollback to previous value on error
      if (context?.previousLanguage) {
        queryClient.setQueryData(languageKeys.preference(), context.previousLanguage);
      }
    },
    onSettled: () => {
      // Refetch after mutation settles to ensure consistency
      queryClient.invalidateQueries({ queryKey: languageKeys.preference() });
    },
  });
}
