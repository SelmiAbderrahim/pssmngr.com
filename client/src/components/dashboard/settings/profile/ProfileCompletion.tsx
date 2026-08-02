// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Profile Completion Component
 *
 * Displays a progress indicator showing how complete the user's profile is.
 * Calculates completion based on:
 * - Name filled (25%)
 * - Avatar set (25%)
 * - Email verified (50%)
 *
 * @module components/dashboard/settings/profile/ProfileCompletion
 */

import * as React from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertCircle, User, Image, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * Props for ProfileCompletion component
 */
export interface ProfileCompletionProps {
  /** Whether the user has set their name */
  hasName: boolean;
  /** Whether the user has set an avatar */
  hasAvatar: boolean;
  /** Whether the user's email is verified */
  isEmailVerified: boolean;
  /** Callback when an action item is clicked */
  onActionClick?: (action: "name" | "avatar" | "email") => void;
  /** Optional className for styling */
  className?: string;
}

/**
 * Individual completion item
 */
interface CompletionItem {
  key: "name" | "avatar" | "email";
  label: string;
  icon: React.ElementType;
  isComplete: boolean;
  weight: number;
}

/**
 * ProfileCompletion - Profile completion progress indicator
 *
 * @example
 * ```tsx
 * <ProfileCompletion
 *   hasName={!!user.name}
 *   hasAvatar={!!user.image}
 *   isEmailVerified={user.emailVerified}
 *   onActionClick={(action) => focusField(action)}
 * />
 * ```
 */
export function ProfileCompletion({
  hasName,
  hasAvatar,
  isEmailVerified,
  onActionClick,
  className,
}: ProfileCompletionProps): React.JSX.Element | null {
  const { t } = useTranslation("settings");

  // Define completion items with weights
  const items: CompletionItem[] = [
    {
      key: "name",
      label: t("profile.completion.addName", "Add your name"),
      icon: User,
      isComplete: hasName,
      weight: 25,
    },
    {
      key: "avatar",
      label: t("profile.completion.addAvatar", "Add a profile picture"),
      icon: Image,
      isComplete: hasAvatar,
      weight: 25,
    },
    {
      key: "email",
      label: t("profile.completion.verifyEmail", "Verify your email address"),
      icon: Mail,
      isComplete: isEmailVerified,
      weight: 50,
    },
  ];

  // Calculate completion percentage
  const completedWeight = items.reduce(
    (sum, item) => sum + (item.isComplete ? item.weight : 0),
    0
  );
  const percentage = Math.round(completedWeight);

  // If profile is complete, optionally hide the card
  const isComplete = percentage === 100;

  // Get incomplete items for display
  const incompleteItems = items.filter((item) => !item.isComplete);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-500" aria-hidden="true" />
          )}
          {t("profile.completion.title", "Profile Completion")}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {isComplete
                ? t("profile.completion.complete", "Your profile is complete")
                : t("profile.completion.incomplete", "Complete your profile")}
            </span>
            <span className="font-medium">
              {t("profile.completion.percentage", "{{percent}}% complete", {
                percent: percentage,
              })}
            </span>
          </div>
          <Progress
            value={percentage}
            className={cn(
              "h-2",
              isComplete ? "[&>div]:bg-green-500" : "[&>div]:bg-amber-500"
            )}
          />
        </div>

        {/* Incomplete items */}
        {incompleteItems.length > 0 && (
          <ul className="space-y-2" role="list">
            {incompleteItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onActionClick?.(item.key)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-md text-start",
                      "text-sm text-muted-foreground",
                      "hover:bg-muted/50 transition-colors",
                      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                      "min-h-[44px]"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Completed state */}
        {isComplete && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <span>{t("profile.completion.allComplete", "All profile items completed!")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ProfileCompletion;
