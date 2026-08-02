// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * AlertBlock Component
 *
 * A flexible alert block with different variants and icons.
 * Used for displaying status messages, errors, and notifications.
 *
 * @module components/shared/AlertBlock
 */

import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

type AlertType = "info" | "success" | "warning" | "error";

interface AlertBlockProps extends React.ComponentPropsWithoutRef<"div"> {
  /** Custom icon to display (overrides default type icon) */
  icon?: React.ReactNode;
  /** Type of alert - determines styling and default icon */
  type?: AlertType;
  /** Children content to display */
  children: React.ReactNode;
}

// =============================================================================
// ICON MAP
// =============================================================================

const iconMap: Record<
  AlertType,
  {
    className: string;
    icon: React.ElementType;
  }
> = {
  info: {
    className: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400",
    icon: Info,
  },
  success: {
    className:
      "bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400",
    icon: CheckCircle2,
  },
  warning: {
    className:
      "bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400",
    icon: AlertCircle,
  },
  error: {
    className: "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400",
    icon: AlertTriangle,
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * AlertBlock - Displays a styled alert message with an icon
 *
 * @example
 * ```tsx
 * <AlertBlock type="error">
 *   An error occurred while processing your request.
 * </AlertBlock>
 *
 * <AlertBlock type="success">
 *   Your changes have been saved.
 * </AlertBlock>
 *
 * <AlertBlock type="warning" icon={<CustomIcon />}>
 *   Custom warning message with custom icon.
 * </AlertBlock>
 * ```
 */
export function AlertBlock({
  type = "info",
  icon,
  children,
  className,
  ...props
}: AlertBlockProps): React.JSX.Element {
  const { className: iconClassName, icon: Icon } = iconMap[type];

  return (
    <div
      role="alert"
      {...props}
      className={cn(
        "flex items-start flex-row gap-4 rounded-lg p-3",
        iconClassName,
        className
      )}
    >
      <div className="flex-shrink-0 mt-0.5">
        {icon || <Icon className="h-4 w-4 text-current" aria-hidden="true" />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-current break-words overflow-wrap-anywhere whitespace-pre-wrap">
          {children}
        </span>
      </div>
    </div>
  );
}

export default AlertBlock;
