// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Google Analytics (gtag.js) integration.
 *
 * Replaces the previous ClickHouse-backed analytics. Tracking is fully gated
 * behind the `VITE_GA_MEASUREMENT_ID` environment variable — when it is empty
 * (the default), no script is loaded and every helper is a no-op, so local and
 * self-hosted deployments send nothing to Google.
 *
 * Zero-knowledge note: only navigation paths and explicit UI events are sent.
 * Never pass vault data, master passwords, credentials, or tokens to gaEvent().
 */

import { isAnalyticsAllowed } from "@/lib/consent";

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as
	| string
	| undefined;

/** True when a GA4 measurement ID has been configured. */
export const isGAEnabled = Boolean(GA_MEASUREMENT_ID);

declare global {
	interface Window {
		dataLayer?: unknown[];
		gtag?: (...args: unknown[]) => void;
	}
}

let initialized = false;

/** Keep route analytics free of tokens and other URL state. */
export function analyticsPathname(path: string): string {
	return path.split(/[?#]/, 1)[0] || "/";
}

/**
 * Inject gtag.js and configure the GA4 stream. Safe to call multiple times;
 * the script is only added once. No-op when no measurement ID is set.
 */
export function initGA(): void {
	if (
		!isGAEnabled ||
		!isAnalyticsAllowed() ||
		initialized ||
		typeof window === "undefined"
	) {
		return;
	}
	initialized = true;
	(window as unknown as Record<string, unknown>)[
		`ga-disable-${GA_MEASUREMENT_ID}`
	] = false;

	const script = document.createElement("script");
	script.async = true;
	script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
	document.head.appendChild(script);

	window.dataLayer = window.dataLayer || [];
	// gtag must push the `arguments` object verbatim, so use a real function.
	window.gtag = function gtag() {
		// eslint-disable-next-line prefer-rest-params
		window.dataLayer!.push(arguments);
	};

	window.gtag("js", new Date());
	window.gtag("consent", "default", {
		analytics_storage: "granted",
		ad_storage: "denied",
		ad_user_data: "denied",
		ad_personalization: "denied",
	});
	// Pageviews are sent manually on route change via gaPageview().
	window.gtag("config", GA_MEASUREMENT_ID, {
		send_page_view: false,
		allow_google_signals: false,
		allow_ad_personalization_signals: false,
	});
}

/** Apply a user's analytics choice without enabling advertising signals. */
export function updateGAConsent(allowed: boolean): void {
	if (!isGAEnabled || typeof window === "undefined") return;

	(window as unknown as Record<string, unknown>)[
		`ga-disable-${GA_MEASUREMENT_ID}`
	] = !allowed;

	if (!allowed) {
		window.gtag?.("consent", "update", {
			analytics_storage: "denied",
			ad_storage: "denied",
			ad_user_data: "denied",
			ad_personalization: "denied",
		});
		return;
	}

	const wasInitialized = initialized;
	initGA();
	window.gtag?.("consent", "update", {
		analytics_storage: "granted",
		ad_storage: "denied",
		ad_user_data: "denied",
		ad_personalization: "denied",
	});
	if (!wasInitialized) gaPageview(window.location.pathname);
}

/** Report a single-page-app navigation. No-op when GA is disabled. */
export function gaPageview(path: string): void {
	if (
		!isGAEnabled ||
		!isAnalyticsAllowed() ||
		typeof window === "undefined" ||
		!window.gtag
	) {
		return;
	}
	const pagePath = analyticsPathname(path);
	window.gtag("event", "page_view", {
		page_path: pagePath,
		// Never send query parameters or fragments: share links and other
		// app routes can contain internal identifiers or short-lived tokens.
		page_location: `${window.location.origin}${window.location.pathname}`,
		page_title: document.title,
	});
}

/** Report a custom event. No-op when GA is disabled. */
export function gaEvent(name: string, params?: Record<string, unknown>): void {
	if (
		!isGAEnabled ||
		!isAnalyticsAllowed() ||
		typeof window === "undefined" ||
		!window.gtag
	) {
		return;
	}
	window.gtag("event", name, params ?? {});
}
