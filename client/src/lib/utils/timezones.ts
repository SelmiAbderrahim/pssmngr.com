// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Timezone Data and Utilities
 *
 * Complete list of IANA timezones grouped by region for schedule configuration.
 *
 * @module lib/utils/timezones
 */

/**
 * Timezone option with label and value
 */
export interface TimezoneOption {
  label: string;
  value: string;
}

/**
 * Complete list of IANA timezones grouped by region
 */
export const TIMEZONES: Record<string, TimezoneOption[]> = {
  Common: [{ label: "UTC (Coordinated Universal Time)", value: "UTC" }],
  Africa: [
    { label: "Abidjan", value: "Africa/Abidjan" },
    { label: "Cairo", value: "Africa/Cairo" },
    { label: "Casablanca", value: "Africa/Casablanca" },
    { label: "Johannesburg", value: "Africa/Johannesburg" },
    { label: "Lagos", value: "Africa/Lagos" },
    { label: "Nairobi", value: "Africa/Nairobi" },
  ],
  America: [
    { label: "Anchorage", value: "America/Anchorage" },
    { label: "Argentina/Buenos Aires", value: "America/Argentina/Buenos_Aires" },
    { label: "Chicago (Central Time)", value: "America/Chicago" },
    { label: "Denver (Mountain Time)", value: "America/Denver" },
    { label: "Los Angeles (Pacific Time)", value: "America/Los_Angeles" },
    { label: "Mexico City", value: "America/Mexico_City" },
    { label: "New York (Eastern Time)", value: "America/New_York" },
    { label: "Sao Paulo (Brasilia Time)", value: "America/Sao_Paulo" },
    { label: "Toronto", value: "America/Toronto" },
    { label: "Vancouver", value: "America/Vancouver" },
  ],
  Asia: [
    { label: "Bangkok", value: "Asia/Bangkok" },
    { label: "Dubai (Gulf Standard Time)", value: "Asia/Dubai" },
    { label: "Hong Kong", value: "Asia/Hong_Kong" },
    { label: "Kolkata (India Standard Time)", value: "Asia/Kolkata" },
    { label: "Seoul", value: "Asia/Seoul" },
    { label: "Shanghai (China Standard Time)", value: "Asia/Shanghai" },
    { label: "Singapore", value: "Asia/Singapore" },
    { label: "Tokyo (Japan Standard Time)", value: "Asia/Tokyo" },
  ],
  Australia: [
    { label: "Brisbane", value: "Australia/Brisbane" },
    { label: "Melbourne", value: "Australia/Melbourne" },
    { label: "Perth", value: "Australia/Perth" },
    { label: "Sydney (Australian Eastern Time)", value: "Australia/Sydney" },
  ],
  Europe: [
    { label: "Amsterdam", value: "Europe/Amsterdam" },
    { label: "Berlin (Central European Time)", value: "Europe/Berlin" },
    { label: "Dublin", value: "Europe/Dublin" },
    { label: "Istanbul", value: "Europe/Istanbul" },
    { label: "London (Greenwich Mean Time)", value: "Europe/London" },
    { label: "Madrid", value: "Europe/Madrid" },
    { label: "Moscow", value: "Europe/Moscow" },
    { label: "Paris (Central European Time)", value: "Europe/Paris" },
    { label: "Rome", value: "Europe/Rome" },
    { label: "Zurich", value: "Europe/Zurich" },
  ],
  Pacific: [
    { label: "Auckland", value: "Pacific/Auckland" },
    { label: "Fiji", value: "Pacific/Fiji" },
    { label: "Honolulu", value: "Pacific/Honolulu" },
  ],
};

/**
 * Get display label for a timezone value
 */
export function getTimezoneLabel(value: string | undefined): string {
  if (!value) return "UTC (default)";

  for (const zones of Object.values(TIMEZONES)) {
    const found = zones.find((tz) => tz.value === value);
    if (found) return found.label;
  }

  return value;
}

/**
 * Get all timezone values as a flat array
 */
export function getAllTimezones(): TimezoneOption[] {
  return Object.values(TIMEZONES).flat();
}
