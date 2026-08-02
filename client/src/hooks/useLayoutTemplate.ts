// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useLayoutTemplate Hook
 *
 * React Query hooks for the user's layout template preference (DB-synced,
 * cross-device). Mirrors useUserLanguage but talks to the real tRPC client
 * (user.getLayoutTemplate / user.updateLayoutTemplate).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcQuery, trpcMutation } from "@/lib/api/trpc";
import { useAuthState } from "@/providers/AuthProvider";
import {
  type LayoutTemplateId,
  coerceTemplate,
} from "@/config/templates";

export const layoutTemplateKeys = {
  all: ["layoutTemplate"] as const,
  preference: () => [...layoutTemplateKeys.all, "preference"] as const,
};

/** Fetch the user's layout template preference from the DB (auth only). */
export function useUserLayoutTemplatePreference() {
  const { status } = useAuthState();
  const isAuthenticated = status === "authenticated";

  return useQuery({
    queryKey: layoutTemplateKeys.preference(),
    queryFn: async (): Promise<LayoutTemplateId> => {
      const value = await trpcQuery<string>("user", "getLayoutTemplate");
      return coerceTemplate(value);
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/** Persist the user's layout template preference to the DB (optimistic). */
export function useUpdateUserLayoutTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (template: LayoutTemplateId) =>
      trpcMutation("user", "updateLayoutTemplate", { layoutTemplate: template }),
    onMutate: async (newTemplate) => {
      await queryClient.cancelQueries({
        queryKey: layoutTemplateKeys.preference(),
      });
      const previous = queryClient.getQueryData<LayoutTemplateId>(
        layoutTemplateKeys.preference()
      );
      queryClient.setQueryData(layoutTemplateKeys.preference(), newTemplate);
      return { previous };
    },
    onError: (_err, _new, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          layoutTemplateKeys.preference(),
          context.previous
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: layoutTemplateKeys.preference(),
      });
    },
  });
}
