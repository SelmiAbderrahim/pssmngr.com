// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Server-side i18next instance for build-time prerendering (SSG).
 *
 * The runtime client instance (`src/i18n.ts`) loads translations asynchronously
 * via `i18next-http-backend`, which cannot resolve during a synchronous
 * `renderToString`/`renderToPipeableStream` pass. This module builds a separate,
 * fully-synchronous instance from resources that the prerender script reads off
 * disk and passes in, so translated text is present in the emitted HTML.
 *
 * The default (English) locale is rendered at build time; non-default locales
 * resolve after hydration exactly as in the current CSR app.
 */
import {
  createInstance,
  type i18n as I18nInstance,
  type Resource,
} from "i18next";
import { initReactI18next } from "react-i18next";

/** Locale -> namespace -> messages. Built by `prerender.mjs` from public/locales. */
export type ServerI18nResources = Record<string, Record<string, unknown>>;

/**
 * Create a synchronous i18next instance preloaded with `resources`. With
 * `initImmediate: false` and no async backend, translations are available
 * immediately on the first render.
 */
export function createServerI18n(
  lng: string,
  resources: ServerI18nResources,
): I18nInstance {
  const instance = createInstance();
  const namespaces = Object.keys(resources[lng] ?? resources.en ?? {});

  // init is synchronous here because resources are inline and initImmediate is
  // false; we intentionally do not await the returned promise.
  void instance.use(initReactI18next).init({
    lng,
    fallbackLng: "en",
    supportedLngs: ["en", "es", "fr", "de", "ar"],
    load: "languageOnly",
    ns: namespaces.length > 0 ? namespaces : ["common"],
    defaultNS: "common",
    resources: resources as unknown as Resource,
    interpolation: { escapeValue: false },
    initImmediate: false,
  });

  return instance;
}
