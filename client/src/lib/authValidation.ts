// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Authentication Validation Schemas
 *
 * Zod schemas for validating authentication forms including:
 * - Email validation (RFC 5322)
 * - Password validation (strength requirements)
 * - Login and Registration forms
 *
 * @module lib/authValidation
 */
import { z } from "zod";
import { TFunction } from "i18next";

// =============================================================================
// EMAIL VALIDATION
// =============================================================================

/**
 * Email validation schema
 * - Required
 * - Valid email format
 * - Maximum 255 characters
 */
export const createEmailSchema = (t: TFunction) =>
  z
    .string()
    .min(1, t("validation:email.required"))
    .max(255, t("validation:email.tooLong"))
    .email(t("validation:email.invalid"));

/**
 * Legacy email schema for backward compatibility
 * @deprecated Use createEmailSchema(t) instead
 */
export const emailSchema = createEmailSchema(
  (() => "Email is required") as unknown as TFunction,
);

// =============================================================================
// PASSWORD VALIDATION
// =============================================================================

/**
 * Password requirements for registration
 */
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
} as const;

/**
 * Password validation schema for registration
 * Full strength requirements:
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const createPasswordSchema = (t: TFunction) =>
  z
    .string()
    .min(
      PASSWORD_REQUIREMENTS.minLength,
      t("validation:password.minLength", {
        min: PASSWORD_REQUIREMENTS.minLength,
      }),
    )
    .max(
      PASSWORD_REQUIREMENTS.maxLength,
      t("validation:password.maxLength", {
        max: PASSWORD_REQUIREMENTS.maxLength,
      }),
    )
    .regex(/[A-Z]/, t("validation:password.requireUppercase"))
    .regex(/[a-z]/, t("validation:password.requireLowercase"))
    .regex(/[0-9]/, t("validation:password.requireNumber"))
    .regex(
      /[!@#$%^&*()_+\-=[\]{}|;':",./<>?]/,
      t("validation:password.requireSpecial"),
    );

/**
 * Legacy password schema for backward compatibility
 * @deprecated Use createPasswordSchema(t) instead
 */
export const passwordSchema = createPasswordSchema(
  (() => "Password must be at least 8 characters") as unknown as TFunction,
);

/**
 * Simple password schema for login (just required check)
 */
export const createLoginPasswordSchema = (t: TFunction) =>
  z.string().min(1, t("validation:password.required"));

/**
 * Legacy login password schema for backward compatibility
 * @deprecated Use createLoginPasswordSchema(t) instead
 */
export const loginPasswordSchema = createLoginPasswordSchema(
  (() => "Password is required") as unknown as TFunction,
);

// =============================================================================
// NAME VALIDATION
// =============================================================================

/**
 * Name validation schema (first name)
 */
export const createNameSchema = (t: TFunction) =>
  z
    .string()
    .min(1, t("validation:name.required"))
    .max(100, t("validation:name.tooLong"))
    .regex(/^[a-zA-Z\s'-]+$/, t("validation:name.invalid"))
    .optional();

/**
 * Last name validation schema
 */
export const createLastNameSchema = (t: TFunction) =>
  z
    .string()
    .min(1, t("validation:lastName.required"))
    .max(100, t("validation:lastName.tooLong"))
    .regex(/^[a-zA-Z\s'-]+$/, t("validation:lastName.invalid"))
    .optional();

/**
 * Legacy name schema for backward compatibility
 * @deprecated Use createNameSchema(t) instead
 */
export const nameSchema = createNameSchema(
  (() => "Name is required") as unknown as TFunction,
);

/**
 * Legacy lastName schema for backward compatibility
 * @deprecated Use createLastNameSchema(t) instead
 */
export const lastNameSchema = createLastNameSchema(
  (() => "Last name is required") as unknown as TFunction,
);

// =============================================================================
// LOGIN SCHEMA
// =============================================================================

/**
 * Login form validation schema
 */
export const createLoginSchema = (t: TFunction) =>
  z.object({
    email: createEmailSchema(t),
    password: createLoginPasswordSchema(t),
    rememberMe: z.boolean(),
  });

/**
 * Legacy login schema for backward compatibility
 * @deprecated Use createLoginSchema(t) instead
 */
export const loginSchema = createLoginSchema(
  (() => "Email is required") as unknown as TFunction,
);

/**
 * Login form type - explicit definition for useForm compatibility
 */
export interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

// =============================================================================
// REGISTRATION SCHEMA
// =============================================================================

/**
 * Registration form validation schema
 */
export const createRegisterSchema = (t: TFunction) =>
  z
    .object({
      email: createEmailSchema(t),
      name: createNameSchema(t).unwrap().or(createNameSchema(t)),
      lastName: createLastNameSchema(t).unwrap().or(createLastNameSchema(t)),
      password: createPasswordSchema(t),
      confirmPassword: z
        .string()
        .min(1, t("validation:password.confirmRequired")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("validation:password.mismatch"),
      path: ["confirmPassword"],
    });

/**
 * Legacy registration schema for backward compatibility
 * @deprecated Use createRegisterSchema(t) instead
 */
export const registerSchema = createRegisterSchema(
  (() => "Email is required") as unknown as TFunction,
);

/**
 * Registration form type
 */
export interface RegisterFormData {
  email: string;
  name?: string;
  lastName?: string;
  password: string;
  confirmPassword: string;
}

// =============================================================================
// INVITATION SCHEMA
// =============================================================================

/**
 * Invitation acceptance registration schema
 */
export const createInvitationSchema = (t: TFunction) =>
  z
    .object({
      firstName: z
        .string()
        .min(1, t("validation:name.required"))
        .max(50, t("validation:name.tooLong")),
      lastName: z
        .string()
        .min(1, t("validation:lastName.required"))
        .max(50, t("validation:lastName.tooLong")),
      email: createEmailSchema(t),
      password: createPasswordSchema(t),
      confirmPassword: z
        .string()
        .min(1, t("validation:password.confirmRequired")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("validation:password.mismatch"),
      path: ["confirmPassword"],
    });

/**
 * Legacy invitation schema for backward compatibility
 * @deprecated Use createInvitationSchema(t) instead
 */
export const invitationSchema = createInvitationSchema(
  (() => "Required") as unknown as TFunction,
);

export type InvitationFormData = z.infer<typeof invitationSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Check if password meets a specific requirement
 */
export function checkPasswordRequirement(
  password: string,
  requirement: "length" | "uppercase" | "lowercase" | "number" | "special",
): boolean {
  switch (requirement) {
    case "length":
      return password.length >= PASSWORD_REQUIREMENTS.minLength;
    case "uppercase":
      return /[A-Z]/.test(password);
    case "lowercase":
      return /[a-z]/.test(password);
    case "number":
      return /[0-9]/.test(password);
    case "special":
      return /[!@#$%^&*]/.test(password);
    default:
      return false;
  }
}

/**
 * Get list of password requirements with their status
 */
export function getPasswordRequirements(
  password: string,
  t: TFunction,
): Array<{
  label: string;
  met: boolean;
}> {
  return [
    {
      label: t("validation:requirements.length", {
        min: PASSWORD_REQUIREMENTS.minLength,
      }),
      met: checkPasswordRequirement(password, "length"),
    },
    {
      label: t("validation:requirements.uppercase"),
      met: checkPasswordRequirement(password, "uppercase"),
    },
    {
      label: t("validation:requirements.lowercase"),
      met: checkPasswordRequirement(password, "lowercase"),
    },
    {
      label: t("validation:requirements.number"),
      met: checkPasswordRequirement(password, "number"),
    },
    {
      label: t("validation:requirements.special"),
      met: checkPasswordRequirement(password, "special"),
    },
  ];
}
