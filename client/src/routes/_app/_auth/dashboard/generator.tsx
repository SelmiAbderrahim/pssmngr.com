// Copyright (c) 2026 Password Manager contributors
/**
 * Password & Passphrase Generator Route
 *
 * Thin route wrapper around `GeneratorPanel` (extracted for reuse by the
 * global navbar Generator dialog). Deep links remain supported:
 * `/dashboard/generator?tab=passphrase` still opens the passphrase tab.
 */

import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { GeneratorPanel, type GeneratorTab } from "@/components/generator/GeneratorPanel";

export const Route = createFileRoute("/_app/_auth/dashboard/generator")({
	component: GeneratorPage,
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab === "passphrase" ? "passphrase" : "password") as GeneratorTab,
	}),
});

function GeneratorPage() {
	const { t } = useTranslation("generator");
	const navigate = useNavigate();
	const { tab } = Route.useSearch();

	const handleTabChange = useCallback(
		(newTab: GeneratorTab) => {
			void navigate({
				to: "/dashboard/generator",
				search: { tab: newTab },
				replace: true,
			});
		},
		[navigate]
	);

	return (
		<div className="container mx-auto p-4 sm:p-6">
			<div className="mb-6">
				<h1 className="text-2xl font-semibold">{t("title", "Password Generator")}</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{t("description", "Generate strong, unique passwords and passphrases")}
				</p>
			</div>
			<GeneratorPanel initialTab={tab} onTabChange={handleTabChange} />
		</div>
	);
}
