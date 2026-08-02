// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
export type FamilyRole = "owner" | "admin" | "member";
export type RecoveryStatus = "pending" | "approved" | "completing" | "completed" | "rejected" | "expired";
export type SharedVaultPermission = "view" | "edit" | "share" | "manage";

export interface FamilyMember {
  id: string;
  userId: string;
  email: string;
  name?: string;
  role: FamilyRole;
  joinedAt: string;
}

export interface FamilyDetails {
  id: string;
  name: string;
  ownerId: string;
  role?: FamilyRole;
  memberCount: number;
  createdAt: string;
}

export type FamilyInvitationStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

export interface FamilyInvitation {
  id: string;
  email: string;
  role: FamilyRole | null;
  status: FamilyInvitationStatus;
  expiresAt: string;
  inviteLink?: string;
}

export interface SharedVault {
  id: string;
  name: string;
  permission?: SharedVaultPermission;
  memberCount: number;
  members?: Array<{
    id: string;
    userId: string;
    permission: SharedVaultPermission;
  }>;
  createdAt: string;
}

export interface SharedVaultDetail {
  id: string;
  name: string;
  permission?: SharedVaultPermission;
  members: SharedVaultMember[];
  wrappedKey?: {
    wrappedKey: string;
    wrappedKeyNonce: string;
    wrappedKeyAuthTag: string;
    ephemeralPublicKey: string;
    senderSignature: string;
  };
  createdAt: string;
}

export interface SharedVaultMember {
  id: string;
  userId: string;
  email: string;
  name?: string;
  user?: {
    id?: string;
    email?: string;
    name?: string | null;
  };
  permission: SharedVaultPermission;
}

export interface RecoveryRequest {
  id: string;
  requesterId: string;
  requesterEmail?: string;
  requesterName?: string;
  status: RecoveryStatus;
  requestedAt: string;
  approvedAt?: string;
  completedAt?: string;
  rejectedAt?: string;
  expiresAt: string;
  newPublicKey?: string;
  newSigningPublicKey?: string;
}
