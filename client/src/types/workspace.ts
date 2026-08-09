// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
export type WorkspaceRole = "owner" | "admin" | "member";

export interface Workspace {
  id: string;
  name: string;
  slug: string | null;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Organization with membership info as returned by
 * `organization.listMyOrganizations` backend procedure.
 */
export interface WorkspaceWithMembership extends Workspace {
  logo: string | null;
  role: WorkspaceRole;
  isDefault: boolean;
  isPersonal?: boolean;
  memberCount: number;
  maxMembers: number;
  planTier: string;
  memberLimit: number;
  isProOrAbove: boolean;
}

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
}
