// Copyright (c) 2026 Password Manager contributors
/**
 * Layout Templates
 *
 * User-selectable presentation presets. A template bundles a vault `viewMode`
 * with a density class applied to <html> (drives spacing + modal width via CSS
 * vars in index.css). The "default" template is the original look.
 *
 * @module config/templates
 */

import type { ViewMode } from "./layout";

export type LayoutTemplateId = "default" | "compact" | "list";

export interface LayoutTemplate {
  /** Vault list presentation */
  viewMode: ViewMode;
  /** Class applied to document.documentElement for density CSS vars */
  densityClass: string;
  /** i18n key for the template name */
  labelKey: string;
  /** i18n key for the template description */
  descKey: string;
}

export const LAYOUT_TEMPLATES: Record<LayoutTemplateId, LayoutTemplate> = {
  default: {
    viewMode: "grid",
    densityClass: "tpl-default",
    labelKey: "settings:layoutTemplate.options.default.name",
    descKey: "settings:layoutTemplate.options.default.desc",
  },
  compact: {
    viewMode: "table",
    densityClass: "tpl-compact",
    labelKey: "settings:layoutTemplate.options.compact.name",
    descKey: "settings:layoutTemplate.options.compact.desc",
  },
  list: {
    viewMode: "list",
    densityClass: "tpl-list",
    labelKey: "settings:layoutTemplate.options.list.name",
    descKey: "settings:layoutTemplate.options.list.desc",
  },
};

export const LAYOUT_TEMPLATE_IDS = Object.keys(
  LAYOUT_TEMPLATES
) as LayoutTemplateId[];

export const DEFAULT_LAYOUT_TEMPLATE: LayoutTemplateId = "default";

export function isLayoutTemplateId(value: unknown): value is LayoutTemplateId {
  return typeof value === "string" && value in LAYOUT_TEMPLATES;
}

/**
 * Coerce a stored template id to a known one. Retired values such as
 * "top-nav" map to the default, so existing preferences remain compatible.
 */
export function coerceTemplate(value: unknown): LayoutTemplateId {
  return isLayoutTemplateId(value) ? value : DEFAULT_LAYOUT_TEMPLATE;
}
