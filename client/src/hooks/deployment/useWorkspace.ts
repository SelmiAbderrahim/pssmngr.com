// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Workspace Hooks
 *
 * TanStack Query hooks for organization/workspace operations.
 * Connects to tRPC backend procedures:
 * - listMyOrganizations (query)
 * - setDefaultOrganization (mutation)
 * - createOrganization (mutation)
 * - deleteOrganization (mutation)
 *
 * @module hooks/deployment/useWorkspace
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcQuery, trpcMutation } from "@/lib/api/trpc";
import { useAuthState } from "@/providers/AuthProvider";
import type {
  WorkspaceWithMembership,
  CreateOrganizationInput,
} from "@/types/workspace";

/**
 * Shared query key prefix for all organization queries.
 * Used for targeted invalidation after mutations.
 */
const ORGANIZATION_QUERY_KEY = ["organization"] as const;

/**
 * Fetch the current user's organization list with membership info.
 *
 * Maps to: `organization.listMyOrganizations`
 */
export function useWorkspaces() {
  const { status } = useAuthState();
  return useQuery<WorkspaceWithMembership[]>({
    queryKey: [...ORGANIZATION_QUERY_KEY, "listMyOrganizations"],
    queryFn: () =>
      trpcQuery<WorkspaceWithMembership[]>(
        "organization",
        "listMyOrganizations"
      ),
    enabled: status === "authenticated",
  });
}

/**
 * Set an organization as the user's default workspace.
 *
 * Maps to: `organization.setDefaultOrganization`
 * Invalidates all organization queries on success.
 */
export function useSetDefaultWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (organizationId: string) =>
      trpcMutation<undefined>("organization", "setDefaultOrganization", {
        organizationId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...ORGANIZATION_QUERY_KEY],
      });
    },
  });
}

/**
 * Create a new organization.
 *
 * Maps to: `organization.createOrganization`
 * Invalidates all organization queries on success.
 */
export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrganizationInput) =>
      trpcMutation<WorkspaceWithMembership>(
        "organization",
        "createOrganization",
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...ORGANIZATION_QUERY_KEY],
      });
    },
  });
}

/**
 * Delete an organization.
 *
 * Maps to: `organization.deleteOrganization`
 * Invalidates all organization queries on success.
 */
export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (organizationId: string) =>
      trpcMutation<undefined>("organization", "deleteOrganization", {
        organizationId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...ORGANIZATION_QUERY_KEY],
      });
    },
  });
}
