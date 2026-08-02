/**
 * Shared types for the password manager client.
 */

export type User = {
  _id: string;
  id: string;
  email: string;
  name?: string;
  image?: string;
  avatarUrl?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  onboardingCompleted?: boolean;
  createdAt?: string;
};
