// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Slider Component - HTML5 based range input
 *
 * A simple range slider component for selecting numeric values.
 */

import React from "react";
import { cn } from "@/lib/utils";

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'aria-valuenow' | 'onChange'> {
  value?: number[];
  onValueChange?: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, min = 0, max = 100, step = 1, onValueChange, onValueCommit, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const numValue = parseFloat(e.target.value);
      // Call onValueChange for real-time updates
      if (onValueChange) {
        onValueChange([numValue]);
      }
      // Call onValueCommit for backward compatibility
      if (onValueCommit) {
        onValueCommit([numValue]);
      }
    };

    // Ensure min is a number for fallback
    const minNum = typeof min === 'number' ? min : parseFloat(String(min)) || 0;
    // Get current value, falling back to min
    const rawValue = Array.isArray(value) ? value[0] : value;
    const currentValue: number = rawValue !== undefined ? rawValue : minNum;

    return (
      <input
        ref={ref}
        type="range"
        className={cn(
          "w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary",
          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer",
          "[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer",
          className
        )}
        min={min}
        max={max}
        step={step}
        value={currentValue}
        onChange={handleChange}
        aria-valuenow={currentValue}
        {...props}
      />
    );
  }
);

Slider.displayName = "Slider";

export { Slider };
