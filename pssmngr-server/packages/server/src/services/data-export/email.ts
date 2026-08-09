// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Data-export email notifications.
 *
 * Two templates:
 *   - dataExportReady   → archive built, includes signed download URL,
 *                         expiry, revoke link, zero-knowledge reminder.
 *   - dataExportFailed  → apology + link back to retry.
 *
 * Both honour the user's `preferredLanguage`.
 */
import {
	buildEmailHtml,
	buildEmailText,
	getNamespacedTranslator,
	getSystemEmailProviderAsync,
	getUserEmailLanguage,
	initI18n,
	type SupportedLanguage,
} from "../..";

interface ExportReadyArgs {
	to: string;
	userId: string | null | undefined;
	downloadUrl: string;
	revokeUrl: string;
	expiresAt: string;
	requestId: string;
}

interface ExportFailedArgs {
	to: string;
	userId: string | null | undefined;
	retryUrl: string;
}

export async function sendDataExportReadyEmail(
	args: ExportReadyArgs,
): Promise<{ success: boolean; error?: string }> {
	try {
		await initI18n();
		const language: SupportedLanguage = await getUserEmailLanguage(args.userId);
		const t = getNamespacedTranslator(language, "emails");

		const subject = t("dataExport.readySubject");
		const title = t("dataExport.readyTitle");
		const greeting = t("common.greeting");
		const footer = t("common.footer");
		const body = `${t("dataExport.readyBody")} ${t("dataExport.expiresOn", { expiresAt: args.expiresAt })}`;
		const additionalContent = `${t("dataExport.zeroKnowledgeNoticeShort")}\n\n${t("dataExport.revokeNotice")}`;
		const actionText = t("dataExport.downloadAction");
		const secondaryAction = {
			text: t("dataExport.revokeAction"),
			url: args.revokeUrl,
		};

		const html = buildEmailHtml({
			language,
			title,
			greeting,
			body,
			actionText,
			actionUrl: args.downloadUrl,
			footer,
			additionalContent,
			secondaryAction,
		});
		const text = buildEmailText({
			language,
			title,
			greeting,
			body,
			actionText,
			actionUrl: args.downloadUrl,
			footer,
			additionalContent,
			secondaryAction,
		});

		const provider = await getSystemEmailProviderAsync();
		const result = await provider.send({
			to: args.to,
			subject,
			html,
			text,
		});
		return { success: result.success, error: result.error };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : "send failed",
		};
	}
}

export async function sendDataExportFailedEmail(
	args: ExportFailedArgs,
): Promise<{ success: boolean; error?: string }> {
	try {
		await initI18n();
		const language: SupportedLanguage = await getUserEmailLanguage(args.userId);
		const t = getNamespacedTranslator(language, "emails");

		const subject = t("dataExport.failedSubject");
		const title = t("dataExport.failedTitle");
		const greeting = t("common.greeting");
		const footer = t("common.footer");
		const body = t("dataExport.failedBody");
		const actionText = t("dataExport.retryAction");

		const html = buildEmailHtml({
			language,
			title,
			greeting,
			body,
			actionText,
			actionUrl: args.retryUrl,
			footer,
		});
		const text = buildEmailText({
			language,
			title,
			greeting,
			body,
			actionText,
			actionUrl: args.retryUrl,
			footer,
		});

		const provider = await getSystemEmailProviderAsync();
		const result = await provider.send({
			to: args.to,
			subject,
			html,
			text,
		});
		return { success: result.success, error: result.error };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : "send failed",
		};
	}
}
