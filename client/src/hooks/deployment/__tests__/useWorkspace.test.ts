// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useWorkspace Hooks Unit Tests
 *
 * Tests for organization/workspace TanStack Query hooks:
 * - useWorkspaces: Fetches organization list via tRPC query
 * - useSetDefaultWorkspace: Sets default org via tRPC mutation
 * - useCreateOrganization: Creates org via tRPC mutation
 * - useDeleteOrganization: Deletes org via tRPC mutation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useWorkspaces,
  useSetDefaultWorkspace,
  useCreateOrganization,
  useDeleteOrganization,
} from "../useWorkspace";
import type { WorkspaceWithMembership } from "@/types/workspace";

// --- Mocks ---

const mockTrpcQuery = vi.fn();
const mockTrpcMutation = vi.fn();

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: () => ({ status: "authenticated", isLoading: false, user: { id: "u-1" } }),
}));

// --- Helpers ---

const mockWorkspaces: WorkspaceWithMembership[] = [
  {
    id: "ws-1",
    name: "My Workspace",
    slug: "my-workspace",
    logo: null,
    createdAt: "2025-01-01T00:00:00Z",
    role: "owner",
    isDefault: true,
    memberCount: 3,
    maxMembers: 10,
    planTier: "pro",
    memberLimit: 10,
    isProOrAbove: true,
  },
  {
    id: "ws-2",
    name: "Team Workspace",
    slug: "team-workspace",
    logo: null,
    createdAt: "2025-02-01T00:00:00Z",
    role: "admin",
    isDefault: false,
    memberCount: 8,
    maxMembers: 10,
    planTier: "pro",
    memberLimit: 10,
    isProOrAbove: true,
  },
];

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper() {
  const queryClient = createQueryClient();
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      ),
  };
}

// --- Tests ---

describe("useWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch workspaces from tRPC", async () => {
    mockTrpcQuery.mockResolvedValueOnce(mockWorkspaces);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useWorkspaces(), { wrapper });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockWorkspaces);
    expect(mockTrpcQuery).toHaveBeenCalledWith(
      "organization",
      "listMyOrganizations"
    );
  });

  it("should return loading state while fetching", () => {
    mockTrpcQuery.mockReturnValue(new Promise(() => {})); // Never resolves
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useWorkspaces(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("should return error state on failure", async () => {
    mockTrpcQuery.mockRejectedValueOnce(new Error("Network error"));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useWorkspaces(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Network error");
  });
});

describe("useSetDefaultWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call tRPC mutation with organizationId", async () => {
    mockTrpcMutation.mockResolvedValueOnce(undefined);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSetDefaultWorkspace(), { wrapper });

    await result.current.mutateAsync("ws-2");

    expect(mockTrpcMutation).toHaveBeenCalledWith(
      "organization",
      "setDefaultOrganization",
      { organizationId: "ws-2" }
    );

    // Should invalidate organization queries
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["organization"],
    });
  });

  it("should report pending state during mutation", async () => {
    let resolveMutation: (() => void) | undefined;
    mockTrpcMutation.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveMutation = resolve;
      })
    );
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSetDefaultWorkspace(), { wrapper });

    // Start mutation but don't await
    const mutationPromise = result.current.mutateAsync("ws-1");

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    // Resolve
    resolveMutation?.();
    await mutationPromise;

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });
});

describe("useCreateOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call tRPC mutation with name and slug", async () => {
    const createdOrg: WorkspaceWithMembership = {
      id: "ws-new",
      name: "New Org",
      slug: "new-org",
      logo: null,
      createdAt: "2025-04-01T00:00:00Z",
      role: "owner",
      isDefault: false,
      memberCount: 1,
      maxMembers: 10,
      planTier: "pro",
      memberLimit: 10,
      isProOrAbove: true,
    };
    mockTrpcMutation.mockResolvedValueOnce(createdOrg);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateOrganization(), { wrapper });

    const returned = await result.current.mutateAsync({
      name: "New Org",
      slug: "new-org",
    });

    expect(mockTrpcMutation).toHaveBeenCalledWith(
      "organization",
      "createOrganization",
      { name: "New Org", slug: "new-org" }
    );

    expect(returned).toEqual(createdOrg);

    // Should invalidate organization queries
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["organization"],
    });
  });

  it("should call tRPC mutation with name only (no slug)", async () => {
    mockTrpcMutation.mockResolvedValueOnce({
      id: "ws-new",
      name: "Just Name",
      slug: "just-name",
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateOrganization(), { wrapper });

    await result.current.mutateAsync({ name: "Just Name" });

    expect(mockTrpcMutation).toHaveBeenCalledWith(
      "organization",
      "createOrganization",
      { name: "Just Name" }
    );
  });

  it("should propagate errors from tRPC", async () => {
    mockTrpcMutation.mockRejectedValueOnce(
      new Error("Plan limit reached")
    );
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateOrganization(), { wrapper });

    await expect(
      result.current.mutateAsync({ name: "Fail Org" })
    ).rejects.toThrow("Plan limit reached");
  });
});

describe("useDeleteOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call tRPC mutation with organizationId", async () => {
    mockTrpcMutation.mockResolvedValueOnce(undefined);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteOrganization(), { wrapper });

    await result.current.mutateAsync("ws-1");

    expect(mockTrpcMutation).toHaveBeenCalledWith(
      "organization",
      "deleteOrganization",
      { organizationId: "ws-1" }
    );

    // Should invalidate organization queries
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["organization"],
    });
  });
});
