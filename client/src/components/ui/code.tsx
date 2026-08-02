// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Code Component
 *
 * Inline code display with monospace font and background.
 */

import { cn } from "@/lib/utils";

interface CodeProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function Code({ children, className, ...props }: CodeProps) {
  return (
    <code
      className={cn(
        "relative rounded bg-muted font-mono text-sm font-semibold",
        "px-[0.3rem] py-[0.2rem]",
        className
      )}
      {...props}
    >
      {children}
    </code>
  );
}
