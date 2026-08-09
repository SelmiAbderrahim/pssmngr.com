// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * GeneratorPanel
 *
 * Route-agnostic password / passphrase generator UI. Extracted from
 * `routes/_app/_auth/dashboard/generator.tsx` so both the standalone
 * `/dashboard/generator` route and the global navbar Generator dialog can
 * render it. Standalone copy behavior is preserved.
 */

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { copySensitiveText } from "@/lib/clipboard";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Copy, RefreshCw, KeyRound, BookOpen, Check } from "lucide-react";
import {
	generatePassword,
	calculateEntropy,
	type GeneratorConfig,
} from "@/services/password-generator";
import {
	generatePassphrase,
	calculatePassphraseEntropy,
	type PassphraseConfig,
} from "@/services/passphrase-generator";
import { SITE_POLICIES, policyToConfig } from "@/services/site-policies";

export type GeneratorTab = "password" | "passphrase";

interface StrengthInfo {
	key: string;
	color: string;
	bgColor: string;
	percentage: number;
}

interface GeneratorPanelProps {
	initialTab?: GeneratorTab;
	onTabChange?: (tab: GeneratorTab) => void;
	/** When set, replaces the "copy to clipboard" primary CTA with an "Use" button. */
	onUsePassword?: (value: string) => void;
	className?: string;
}

function getStrengthKey(entropy: number): StrengthInfo {
	if (entropy < 28) {
		return {
			key: "strength.weak",
			color: "bg-red-500",
			bgColor: "bg-red-100 dark:bg-red-900/20",
			percentage: Math.min((entropy / 28) * 20, 20),
		};
	}
	if (entropy < 40) {
		return {
			key: "strength.fair",
			color: "bg-orange-500",
			bgColor: "bg-orange-100 dark:bg-orange-900/20",
			percentage: 20 + ((entropy - 28) / 12) * 20,
		};
	}
	if (entropy < 60) {
		return {
			key: "strength.good",
			color: "bg-yellow-500",
			bgColor: "bg-yellow-100 dark:bg-yellow-900/20",
			percentage: 40 + ((entropy - 40) / 20) * 20,
		};
	}
	if (entropy < 80) {
		return {
			key: "strength.strong",
			color: "bg-green-500",
			bgColor: "bg-green-100 dark:bg-green-900/20",
			percentage: 60 + ((entropy - 60) / 20) * 20,
		};
	}
	return {
		key: "strength.veryStrong",
		color: "bg-green-600",
		bgColor: "bg-green-100 dark:bg-green-900/20",
		percentage: Math.min(80 + ((entropy - 80) / 48) * 20, 100),
	};
}

async function copyToClipboard(text: string, successMsg: string, failMsg: string) {
	try {
		await copySensitiveText(text);
		toast.success(successMsg);
	} catch {
		toast.error(failMsg);
	}
}

export function GeneratorPanel({
	initialTab = "password",
	onTabChange,
	onUsePassword,
	className,
}: GeneratorPanelProps) {
	const { t } = useTranslation("generator");
	const [tab, setTab] = useState<GeneratorTab>(initialTab);

	const handleTabChange = useCallback(
		(newTab: string) => {
			const next = newTab as GeneratorTab;
			setTab(next);
			onTabChange?.(next);
		},
		[onTabChange]
	);

	return (
		<div className={className}>
			<Tabs value={tab} onValueChange={handleTabChange}>
				<TabsList className="mb-4">
					<TabsTrigger value="password" className="gap-1.5">
						<KeyRound className="h-4 w-4" />
						{t("tabs.password", "Password")}
					</TabsTrigger>
					<TabsTrigger value="passphrase" className="gap-1.5">
						<BookOpen className="h-4 w-4" />
						{t("tabs.passphrase", "Passphrase")}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="password">
					<PasswordGenerator onUse={onUsePassword} />
				</TabsContent>
				<TabsContent value="passphrase">
					<PassphraseGenerator onUse={onUsePassword} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function PasswordGenerator({ onUse }: { onUse?: (value: string) => void }) {
	const { t } = useTranslation("generator");
	const [config, setConfig] = useState<GeneratorConfig>({
		length: 16,
		uppercase: true,
		lowercase: true,
		digits: true,
		symbols: true,
		excludeAmbiguous: false,
	});
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [activePolicy, setActivePolicy] = useState<string>("none");

	const regenerate = useCallback(() => {
		try {
			setError(null);
			setPassword(generatePassword(config));
		} catch (err) {
			setError(err instanceof Error ? err.message : t("error", "Generation failed"));
			setPassword("");
		}
	}, [config, t]);

	useEffect(() => {
		regenerate();
	}, [regenerate]);

	let entropy = 0;
	try {
		entropy = calculateEntropy(config);
	} catch {
		// Pool empty — entropy stays 0
	}
	const strength = getStrengthKey(entropy);

	const updateConfig = (updates: Partial<GeneratorConfig>) => {
		setActivePolicy("none");
		setConfig((prev) => ({ ...prev, ...updates }));
	};

	const applyPolicy = (policyId: string) => {
		setActivePolicy(policyId);
		if (policyId === "none") return;
		const policy = SITE_POLICIES.find((p) => p.id === policyId);
		if (policy) {
			setConfig(policyToConfig(policy));
		}
	};

	const canDisable = (field: keyof GeneratorConfig) => {
		const active = [config.uppercase, config.lowercase, config.digits, config.symbols].filter(Boolean).length;
		return active > 1 || !config[field];
	};

	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<Card className="rounded-lg border bg-card shadow-sm lg:col-span-2">
				<CardContent className="pt-6">
					<div className="flex items-center gap-2 mb-4">
						<div className="flex-1 min-w-0 rounded-md border bg-muted/50 px-4 py-3">
							<p
								className="font-mono text-lg break-all select-all"
								aria-label={t("aria.generatedPassword", "Generated password")}
							>
								{error ? (
									<span className="text-destructive text-sm font-sans">{error}</span>
								) : (
									password
								)}
							</p>
						</div>
						<div className="flex flex-col gap-1.5 flex-shrink-0">
							{onUse && (
								<Button
									variant="default"
									size="icon"
									className="h-[44px] w-[44px]"
									onClick={() => onUse(password)}
									disabled={!password}
									aria-label={t("aria.usePassword", "Use password")}
								>
									<Check className="h-4 w-4" />
								</Button>
							)}
							<Button
								variant="outline"
								size="icon"
								className="h-[44px] w-[44px]"
								onClick={() =>
									copyToClipboard(
										password,
										t("copy.success", "Copied to clipboard"),
										t("copy.failed", "Failed to copy")
									)
								}
								disabled={!password}
								aria-label={t("aria.copyPassword", "Copy password")}
							>
								<Copy className="h-4 w-4" />
							</Button>
							<Button
								variant="outline"
								size="icon"
								className="h-[44px] w-[44px]"
								onClick={regenerate}
								aria-label={t("aria.regenerate", "Regenerate password")}
							>
								<RefreshCw className="h-4 w-4" />
							</Button>
						</div>
					</div>
					<EntropyMeter entropy={entropy} strength={strength} />
				</CardContent>
			</Card>

			<Card className="rounded-lg border bg-card shadow-sm lg:col-span-2">
				<CardContent className="pt-6">
					<div className="flex items-center justify-between mb-3">
						<Label htmlFor="policy-preset">{t("preset.label", "Site Policy Preset")}</Label>
					</div>
					<Select value={activePolicy} onValueChange={applyPolicy}>
						<SelectTrigger id="policy-preset" className="w-full">
							<SelectValue placeholder={t("preset.placeholder", "No preset")} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">{t("preset.custom", "No preset (custom)")}</SelectItem>
							{SITE_POLICIES.map((policy) => (
								<SelectItem key={policy.id} value={policy.id}>
									{policy.name}
									{policy.minLength && (
										<span className="text-muted-foreground">
											{" "}
											— {policy.minLength}
											{policy.maxLength ? `–${policy.maxLength}` : "+"} chars
										</span>
									)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</CardContent>
			</Card>

			<Card className="rounded-lg border bg-card shadow-sm lg:col-span-2">
				<CardContent className="pt-6">
					<div className="flex items-center justify-between mb-3">
						<Label htmlFor="password-length">{t("length", "Length")}</Label>
						<span className="text-sm font-medium tabular-nums">{config.length}</span>
					</div>
					<Slider
						id="password-length"
						min={8}
						max={128}
						step={1}
						value={[config.length]}
						onValueChange={([v]) => updateConfig({ length: v })}
					/>
					<div className="flex justify-between text-xs text-muted-foreground mt-1">
						<span>8</span>
						<span>128</span>
					</div>
				</CardContent>
			</Card>

			<Card className="rounded-lg border bg-card shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-sm font-medium">{t("characterSets.title", "Character Sets")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-0">
					<ToggleRow
						id="gen-uppercase"
						label={t("characterSets.uppercase", "Uppercase (A-Z)")}
						checked={config.uppercase}
						disabled={!canDisable("uppercase")}
						onCheckedChange={(v) => updateConfig({ uppercase: v })}
					/>
					<ToggleRow
						id="gen-lowercase"
						label={t("characterSets.lowercase", "Lowercase (a-z)")}
						checked={config.lowercase}
						disabled={!canDisable("lowercase")}
						onCheckedChange={(v) => updateConfig({ lowercase: v })}
					/>
					<ToggleRow
						id="gen-digits"
						label={t("characterSets.digits", "Digits (0-9)")}
						checked={config.digits}
						disabled={!canDisable("digits")}
						onCheckedChange={(v) => updateConfig({ digits: v })}
					/>
					<ToggleRow
						id="gen-symbols"
						label={t("characterSets.symbols", "Symbols (!@#$%...)")}
						checked={config.symbols}
						disabled={!canDisable("symbols")}
						onCheckedChange={(v) => updateConfig({ symbols: v })}
					/>
				</CardContent>
			</Card>

			<Card className="rounded-lg border bg-card shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-sm font-medium">{t("options.title", "Options")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-0">
					<ToggleRow
						id="gen-ambiguous"
						label={t("options.excludeAmbiguous", "Exclude ambiguous (0O1lI)")}
						checked={config.excludeAmbiguous ?? false}
						onCheckedChange={(v) => updateConfig({ excludeAmbiguous: v })}
					/>
				</CardContent>
			</Card>
		</div>
	);
}

function PassphraseGenerator({ onUse }: { onUse?: (value: string) => void }) {
	const { t } = useTranslation("generator");
	const [config, setConfig] = useState<PassphraseConfig>({
		wordCount: 4,
		separator: "-",
		capitalize: true,
		includeNumber: false,
	});
	const [passphrase, setPassphrase] = useState("");
	const [error, setError] = useState<string | null>(null);

	const regenerate = useCallback(() => {
		try {
			setError(null);
			setPassphrase(generatePassphrase(config));
		} catch (err) {
			setError(err instanceof Error ? err.message : t("error", "Generation failed"));
			setPassphrase("");
		}
	}, [config, t]);

	useEffect(() => {
		regenerate();
	}, [regenerate]);

	const entropy = calculatePassphraseEntropy(config);
	const strength = getStrengthKey(entropy);

	const updateConfig = (updates: Partial<PassphraseConfig>) => {
		setConfig((prev) => ({ ...prev, ...updates }));
	};

	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<Card className="rounded-lg border bg-card shadow-sm lg:col-span-2">
				<CardContent className="pt-6">
					<div className="flex items-center gap-2 mb-4">
						<div className="flex-1 min-w-0 rounded-md border bg-muted/50 px-4 py-3">
							<p
								className="font-mono text-lg break-all select-all"
								aria-label={t("aria.generatedPassphrase", "Generated passphrase")}
							>
								{error ? (
									<span className="text-destructive text-sm font-sans">{error}</span>
								) : (
									passphrase
								)}
							</p>
						</div>
						<div className="flex flex-col gap-1.5 flex-shrink-0">
							{onUse && (
								<Button
									variant="default"
									size="icon"
									className="h-[44px] w-[44px]"
									onClick={() => onUse(passphrase)}
									disabled={!passphrase}
									aria-label={t("aria.usePassphrase", "Use passphrase")}
								>
									<Check className="h-4 w-4" />
								</Button>
							)}
							<Button
								variant="outline"
								size="icon"
								className="h-[44px] w-[44px]"
								onClick={() =>
									copyToClipboard(
										passphrase,
										t("copy.success", "Copied to clipboard"),
										t("copy.failed", "Failed to copy")
									)
								}
								disabled={!passphrase}
								aria-label={t("aria.copyPassphrase", "Copy passphrase")}
							>
								<Copy className="h-4 w-4" />
							</Button>
							<Button
								variant="outline"
								size="icon"
								className="h-[44px] w-[44px]"
								onClick={regenerate}
								aria-label={t("aria.regeneratePassphrase", "Regenerate passphrase")}
							>
								<RefreshCw className="h-4 w-4" />
							</Button>
						</div>
					</div>
					<EntropyMeter entropy={entropy} strength={strength} />
				</CardContent>
			</Card>

			<Card className="rounded-lg border bg-card shadow-sm lg:col-span-2">
				<CardContent className="pt-6">
					<div className="flex items-center justify-between mb-3">
						<Label htmlFor="word-count">{t("passphrase.wordCount", "Word Count")}</Label>
						<span className="text-sm font-medium tabular-nums">{config.wordCount}</span>
					</div>
					<Slider
						id="word-count"
						min={3}
						max={10}
						step={1}
						value={[config.wordCount]}
						onValueChange={([v]) => updateConfig({ wordCount: v })}
					/>
					<div className="flex justify-between text-xs text-muted-foreground mt-1">
						<span>3</span>
						<span>10</span>
					</div>
				</CardContent>
			</Card>

			<Card className="rounded-lg border bg-card shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-sm font-medium">{t("passphrase.separator", "Separator")}</CardTitle>
				</CardHeader>
				<CardContent>
					<Select value={config.separator} onValueChange={(v) => updateConfig({ separator: v })}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="-">{t("passphrase.hyphen", "Hyphen (-)")}</SelectItem>
							<SelectItem value=" ">{t("passphrase.space", "Space ( )")}</SelectItem>
							<SelectItem value=".">{t("passphrase.period", "Period (.)")}</SelectItem>
							<SelectItem value="_">{t("passphrase.underscore", "Underscore (_)")}</SelectItem>
						</SelectContent>
					</Select>
				</CardContent>
			</Card>

			<Card className="rounded-lg border bg-card shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-sm font-medium">{t("options.title", "Options")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-0">
					<ToggleRow
						id="pp-capitalize"
						label={t("passphrase.capitalize", "Capitalize words")}
						checked={config.capitalize}
						onCheckedChange={(v) => updateConfig({ capitalize: v })}
					/>
					<ToggleRow
						id="pp-number"
						label={t("passphrase.includeNumber", "Include number")}
						checked={config.includeNumber}
						onCheckedChange={(v) => updateConfig({ includeNumber: v })}
					/>
				</CardContent>
			</Card>
		</div>
	);
}

function EntropyMeter({ entropy, strength }: { entropy: number; strength: StrengthInfo }) {
	const { t } = useTranslation("generator");
	return (
		<div>
			<div className="h-2 w-full rounded-md bg-muted overflow-hidden">
				<div
					className={`h-full rounded-md transition-all duration-150 ${strength.color}`}
					style={{ width: `${strength.percentage}%` }}
				/>
			</div>
			<div className="flex items-center justify-between mt-2">
				<span className="text-sm font-medium">{t(strength.key)}</span>
				<span className="text-xs text-muted-foreground tabular-nums">
					{Math.round(entropy)} {t("entropy.label", "bits of entropy")}
				</span>
			</div>
		</div>
	);
}

function ToggleRow({
	id,
	label,
	checked,
	disabled,
	onCheckedChange,
}: {
	id: string;
	label: string;
	checked: boolean;
	disabled?: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between py-3 min-h-[44px]">
			<Label htmlFor={id} className="cursor-pointer font-normal">
				{label}
			</Label>
			<Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
		</div>
	);
}
