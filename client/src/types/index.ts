// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
// Global type definitions for Password Manager Dashboard

export type UserRole = "owner" | "admin" | "member";

// User types
export interface User {
  _id: string;
  id?: string;
  email: string;
  name?: string;
  avatar?: string;
  avatarUrl?: string;
  username?: string;
  isAnonymous?: boolean;
  emailVerificationTime?: number;
  phoneVerificationTime?: number;
  createdAt: number;
  updatedAt?: number;
  // OAuth provider IDs
  githubId?: string;
  googleId?: string;
  // Password authentication
  passwordHash?: string;
  authProvider?: "password" | "github" | "google" | "otp";
  // User role for permission checks
  role?: UserRole;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type Id<T extends string = string> = `${T}_${string}`;

export type Timestamp = number;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray;

export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonArray = JsonValue[];

// Error types
export interface AppError {
  code: string;
  message: string;
  details?: unknown;
  stack?: string;
  timestamp: number;
  userId?: string;
  requestId?: string;
}

export interface ValidationError extends AppError {
  field?: string;
  validationRule?: string;
}

export interface ProcessingError extends AppError {
  stage?: string;
  retryable?: boolean;
}

// Component prop types
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}
