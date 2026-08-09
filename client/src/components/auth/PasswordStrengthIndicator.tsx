// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Password Strength Indicator Component
 *
 * Visual display of password strength with:
 * - Progress bar with semantic colors
 * - Strength label
 * - Requirement checklist
 *
 * Fully accessible with aria-live announcements.
 *
 * @module components/auth/PasswordStrengthIndicator
 */
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { usePasswordStrength } from "@/hooks/usePasswordStrength";
import { Check, X } from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================

export interface PasswordStrengthIndicatorProps {
  /** Password to evaluate */
  password: string;
  /** Whether to show the requirement list */
  showRequirements?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Password strength indicator with progress bar and requirements
 *
 * @example
 * ```tsx
 * <PasswordStrengthIndicator
 *   password={password}
 *   showRequirements={true}
 * />
 * ```
 */
export function PasswordStrengthIndicator({
  password,
  showRequirements = true,
  className,
}: PasswordStrengthIndicatorProps) {
  const { t } = useTranslation("auth");
  const { strength, score, requirements, feedback } = usePasswordStrength(password, t);

  // Don't show anything if no password entered
  if (!password || password.length === 0) {
    return null;
  }

  const strengthLabels = {
    none: "",
    weak: t("passwordStrength.weak"),
    medium: t("passwordStrength.medium"),
    strong: t("passwordStrength.strong"),
  };

  return (
    <div
      className={cn("space-y-2", className)}
      role="status"
      aria-live="polite"
      aria-label={`${t("passwordStrength.label")}: ${strengthLabels[strength]}`}
    >
      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t("passwordStrength.label")}</span>
          <span
            className={cn(
              "font-medium",
              strength === "weak" && "text-destructive",
              strength === "medium" && "text-amber-500",
              strength === "strong" && "text-green-500"
            )}
          >
            {strengthLabels[strength]}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-md bg-muted">
          <div
            className={cn(
              "h-full transition-[width,background-color] duration-300 ease-out",
              strength === "weak" && "bg-destructive",
              strength === "medium" && "bg-amber-500",
              strength === "strong" && "bg-green-500"
            )}
            style={{ width: `${score}%` }}
            role="progressbar"
            aria-valuenow={score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${t("passwordStrength.label")}: ${score}%`}
          />
        </div>
      </div>

      {/* Requirements List */}
      {showRequirements && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground mb-2">
            {t("passwordStrength.requirements.title")}
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground" aria-label={t("passwordStrength.requirements.ariaLabel")}>
            {(Object.keys(requirements) as Array<keyof typeof requirements>).map((key) => (
              <RequirementItem
                key={key}
                met={requirements[key]}
                label={t(`passwordStrength.requirements.${key}`)}
              />
            ))}
          </ul>
          {feedback && feedback.length > 0 && (
            <ul className="text-xs text-amber-600 mt-2 space-y-0.5" role="alert">
              {feedback.map((msg, index) => (
                <li key={index}>{msg}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface RequirementItemProps {
  met: boolean;
  label: string;
}

function RequirementItem({ met, label }: RequirementItemProps) {
  const { t } = useTranslation("auth");

  return (
    <li
      className={cn(
        "flex items-center gap-2 transition-colors",
        met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
      )}
    >
      {met ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>{label}</span>
      <span className="sr-only">
        {met
          ? `(${t("passwordStrength.requirements.met")})`
          : `(${t("passwordStrength.requirements.notMet")})`}
      </span>
    </li>
  );
}

export default PasswordStrengthIndicator;
