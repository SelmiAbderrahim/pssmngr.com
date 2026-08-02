// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
// Password Manager - Server Package Exports
// Only exports modules that exist and are needed for the password-manager build.

export * from "./constants/index";
export * from "./email";
export type {
	Namespace,
	SupportedLanguage,
	TFunction,
} from "./i18n";
// i18n (Internationalization)
export {
	badRequestError,
	buildKey,
	createFailedError,
	createNamespacedTranslator,
	// Typed translator utilities
	createTypedTranslator,
	DEFAULT_LANGUAGE,
	deleteFailedError,
	extractKeyPath,
	extractNamespace,
	forbiddenError,
	getEffectiveLanguage,
	getI18nInstance,
	getNamespacedTranslator,
	getTranslator,
	initI18n,
	internalError,
	isInitialized as isI18nInitialized,
	isLanguageSupported,
	isSupportedLanguage,
	isValidTranslationKey,
	NAMESPACES,
	normalizeLanguage,
	notFoundError,
	// Language detection
	parseAcceptLanguage,
	parseAcceptLanguageHeader,
	permissionError,
	resetI18nForTesting,
	SUPPORTED_LANGUAGES,
	// Error helpers for tRPC integration
	unauthorizedError,
	updateFailedError,
	wrapError,
} from "./i18n";
export * from "./lib/auth";
export * from "./lib/logger";
export * from "./services/notification";
export * from "./utils/pagination";
