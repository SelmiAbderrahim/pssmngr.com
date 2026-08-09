// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Password Strength Hook
 *
 * Calculates password strength based on:
 * - Length
 * - Character variety (uppercase, lowercase, numbers, special)
 * - Common password patterns
 * - Sequential characters
 *
 * @module hooks/usePasswordStrength
 */
import { useMemo } from "react";
import type { TFunction } from "i18next";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Password strength levels
 */
export type PasswordStrength = "none" | "weak" | "medium" | "strong";

/**
 * Password strength result
 */
export interface PasswordStrengthResult {
  /** Strength level */
  strength: PasswordStrength;
  /** Score from 0-100 */
  score: number;
  /** Color for UI display */
  color: string;
  /** CSS variable for color */
  colorVar: string;
  /** Feedback messages */
  feedback: string[];
  /** Individual requirement checks */
  requirements: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Common passwords to reject */
const COMMON_PASSWORDS = new Set([
  "password", "123456", "12345678", "qwerty", "abc123",
  "monkey", "1234567", "letmein", "trustno1", "dragon",
  "baseball", "iloveyou", "master", "sunshine", "ashley",
  "bailey", "passw0rd", "shadow", "123123", "654321",
  "superman", "qazwsx", "michael", "football", "password1",
  "password123", "batman", "login", "welcome", "admin",
  "hello", "charlie", "donald", "loveme", "starwars",
]);

/** Sequential character patterns to detect */
const SEQUENTIAL_PATTERNS = [
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "0123456789",
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if password contains sequential characters
 */
function hasSequentialChars(password: string): boolean {
  const lower = password.toLowerCase();
  for (const pattern of SEQUENTIAL_PATTERNS) {
    for (let i = 0; i < pattern.length - 2; i++) {
      if (lower.includes(pattern.substring(i, i + 3))) {
        return true;
      }
      // Also check reverse
      if (lower.includes(pattern.substring(i, i + 3).split("").reverse().join(""))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if password is a common password
 */
function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

/**
 * Check for repeated characters
 */
function hasRepeatedChars(password: string): boolean {
  return /(.)\1{2,}/.test(password);
}

/**
 * Calculate password score
 */
function calculateScore(password: string, t?: TFunction): {
  score: number;
  feedback: string[];
  requirements: PasswordStrengthResult["requirements"];
} {
  const feedback: string[] = [];
  let score = 0;

  // Helper to get translated feedback or fallback
  const getFeedback = (key: string, fallback: string): string => {
    return t ? t(`passwordStrength.feedback.${key}`, fallback) : fallback;
  };

  // Check requirements
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=[\]{}|;':",./<>?]/.test(password),
  };

  // Length scoring
  if (password.length >= 8) {
    score += 20;
  } else {
    feedback.push(getFeedback("useMinChars", "Use at least 8 characters"));
  }

  if (password.length >= 12) {
    score += 10;
  }

  if (password.length >= 16) {
    score += 10;
  }

  // Character variety scoring
  if (requirements.uppercase) {
    score += 15;
  } else {
    feedback.push(getFeedback("addUppercase", "Add an uppercase letter"));
  }

  if (requirements.lowercase) {
    score += 15;
  } else {
    feedback.push(getFeedback("addLowercase", "Add a lowercase letter"));
  }

  if (requirements.number) {
    score += 15;
  } else {
    feedback.push(getFeedback("addNumber", "Add a number"));
  }

  if (requirements.special) {
    score += 15;
  } else {
    feedback.push(getFeedback("addSpecial", "Add a special character (!@#$%^&*)"));
  }

  // Penalties
  if (isCommonPassword(password)) {
    score = Math.max(0, score - 40);
    feedback.push(getFeedback("avoidCommon", "Avoid common passwords"));
  }

  if (hasSequentialChars(password)) {
    score = Math.max(0, score - 15);
    feedback.push(getFeedback("avoidSequential", "Avoid sequential characters (abc, 123)"));
  }

  if (hasRepeatedChars(password)) {
    score = Math.max(0, score - 10);
    feedback.push(getFeedback("avoidRepeated", "Avoid repeated characters (aaa, 111)"));
  }

  return {
    score: Math.min(100, score),
    feedback,
    requirements,
  };
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook to calculate password strength
 *
 * @param password - Password to evaluate
 * @param t - Optional translation function for feedback messages
 * @returns Password strength analysis
 *
 * @example
 * ```tsx
 * const { t } = useTranslation("auth");
 * const { strength, score, color, feedback } = usePasswordStrength(password, t);
 *
 * return (
 *   <div>
 *     <ProgressBar value={score} color={color} />
 *     <span>Strength: {strength}</span>
 *   </div>
 * );
 * ```
 */
export function usePasswordStrength(password: string, t?: TFunction): PasswordStrengthResult {
  return useMemo(() => {
    // Handle empty password
    if (!password || password.length === 0) {
      return {
        strength: "none",
        score: 0,
        color: "var(--muted)",
        colorVar: "--muted",
        feedback: [],
        requirements: {
          length: false,
          uppercase: false,
          lowercase: false,
          number: false,
          special: false,
        },
      };
    }

    const { score, feedback, requirements } = calculateScore(password, t);

    // Determine strength level
    let strength: PasswordStrength;
    let color: string;
    let colorVar: string;

    if (score < 40) {
      strength = "weak";
      color = "var(--destructive)";
      colorVar = "--destructive";
    } else if (score < 70) {
      strength = "medium";
      color = "var(--warning, #f59e0b)";
      colorVar = "--warning";
    } else {
      strength = "strong";
      color = "var(--success, #22c55e)";
      colorVar = "--success";
    }

    return {
      strength,
      score,
      color,
      colorVar,
      feedback,
      requirements,
    };
  }, [password, t]);
}

export default usePasswordStrength;
