// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * SecurityScoreBadge
 *
 * Small presentational badge for the Watchtower page header, relocated from
 * the retired dashboard home. Reads `useWatchtowerBadge()` and
 * renders the score + issue count exactly like the old dashboard card.
 */

import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, ArrowRight } from "lucide-react";
import { useWatchtowerBadge } from "@/hooks/useWatchtowerBadge";

function getScoreKey(score: number): string {
	if (score >= 90) return "dashboard.scoreExcellent";
	if (score >= 70) return "dashboard.scoreGood";
	if (score >= 50) return "dashboard.scoreFair";
	return "dashboard.scoreWeak";
}

function getScoreColor(score: number): string {
	if (score >= 90) return "text-green-600";
	if (score >= 70) return "text-blue-600";
	if (score >= 50) return "text-yellow-600";
	return "text-destructive";
}

function getScoreBadgeClass(score: number): string {
	if (score >= 90) return "border-green-600 text-green-600";
	if (score >= 70) return "border-blue-600 text-blue-600";
	if (score >= 50) return "border-yellow-600 text-yellow-600";
	return "border-destructive text-destructive";
}

interface SecurityScoreBadgeProps {
	isLoading?: boolean;
}

export function SecurityScoreBadge({ isLoading = false }: SecurityScoreBadgeProps) {
	const { t } = useTranslation("common");
	const { score, issueCount } = useWatchtowerBadge();

	if (isLoading) {
		return <Skeleton className="h-8 w-32" />;
	}

	if (score === null) {
		return (
			<Link
				to="/dashboard/watchtower"
				search={{ tab: "weak" }}
				className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md text-sm font-medium text-primary hover:underline"
			>
				<Shield className="h-4 w-4" />
				{t("dashboard.checkSecurity", "Run security checkup")}
				<ArrowRight className="h-3.5 w-3.5 rtl:scale-x-[-1]" />
			</Link>
		);
	}

	return (
		<div className="flex items-center gap-3">
			<Shield className="h-5 w-5 text-muted-foreground" aria-hidden />
			<span className={`text-3xl font-semibold tabular-nums ${getScoreColor(score)}`}>{score}</span>
			<div>
				<Badge variant="outline" className={`gap-1 ${getScoreBadgeClass(score)}`}>
					{t(getScoreKey(score))}
				</Badge>
				{issueCount > 0 && (
					<Link
						to="/dashboard/watchtower"
						search={{ tab: "weak" }}
						className="mt-1 inline-flex min-h-[44px] items-center rounded-md text-xs text-muted-foreground hover:underline"
					>
						{t("dashboard.issuesFound", { count: issueCount })}
					</Link>
				)}
			</div>
		</div>
	);
}
