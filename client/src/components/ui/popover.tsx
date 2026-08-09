// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
"use client"

/**
 * Popover Component
 *
 * Shadcn UI Popover component using Radix UI primitives.
 *
 * @module components/ui/popover
 * @rtl Full RTL support with dynamic dir prop
 */

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"
import { useDirection, type Direction } from "@/lib/rtl"

/**
 * Popover Root
 * Note: Radix Popover doesn't accept dir on Root - direction is handled by Content
 */
const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverAnchor = PopoverPrimitive.Anchor

interface PopoverContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>, "dir"> {
  /** Text direction - defaults to document direction */
  dir?: Direction;
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = "center", sideOffset = 4, dir, ...props }, ref) => {
  const documentDir = useDirection();
  const effectiveDir = dir ?? documentDir;

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        dir={effectiveDir}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // Base styles with responsive width and RTL-aware positioning
          "z-50 w-full max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none",
          // Responsive width: full on mobile, fixed on desktop
          "sm:w-72 sm:max-w-none",
          // Animation states
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          // RTL-aware slide animations (using logical directions)
          "data-[side=bottom]:slide-in-from-top-2",
          "data-[side=top]:slide-in-from-bottom-2",
          "data-[side=left]:slide-in-from-end-2 data-[side=right]:slide-in-from-start-2",
          // RTL support: Radix handles side positioning, but we ensure animations respect direction
          "rtl:data-[side=left]:slide-in-from-start-2 rtl:data-[side=right]:slide-in-from-end-2",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
