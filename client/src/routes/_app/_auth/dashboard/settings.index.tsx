// Copyright (c) 2026 Password Manager contributors
import { useState, useCallback, useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowRight,
  Calendar,
  Check,
  Database,
  Loader2,
  Lock,
  LifeBuoy,
  Monitor,
  Moon,
  Shield,
  Sliders,
  Sun,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthState } from "@/providers/AuthProvider";
import { trpcMutation } from "@/lib/api/trpc";
import { LanguagePreference } from "@/components/dashboard/settings/preferences/LanguagePreference";
import { LayoutTemplatePreference } from "@/components/dashboard/settings/preferences/LayoutTemplatePreference";
import { GuideMeToggle } from "@/features/guide";
import { ProtectionExplainer } from "@/components/security/ProtectionExplainer";
import { PrivacySettings } from "@/components/privacy/PrivacySettings";
import { isGAEnabled } from "@/lib/analytics/gtag";
import {
  vaultCrypto,
  getPersistentUnlockDays,
  setPersistentUnlockDays,
} from "@/services/vault-crypto";
import {
  enrollDeviceInBackground,
  isEnrollmentDeferred,
} from "@/services/keypair-manager";

const settingsTabs = [
  "account",
  "security",
  "devices",
  "data",
  "preferences",
] as const;

type SettingsTab = (typeof settingsTabs)[number];

const isSettingsTab = (tab: unknown): tab is SettingsTab =>
  settingsTabs.includes(tab as SettingsTab);

export const Route = createFileRoute("/_app/_auth/dashboard/settings/")({
  component: SettingsIndexPage,
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } =>
    isSettingsTab(search.tab) ? { tab: search.tab } : {},
});

const profileSchema = z.object({
  name: z
    .string()
    .min(2, { message: "settings.validation.nameMin" })
    .max(100, { message: "settings.validation.nameMax" }),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const AUTO_LOCK_KEY = "pssmngr-auto-lock-ms";

const autoLockOptions = [
  { value: "60000", labelKey: "settings.autoLockOptions.1min" },
  { value: "300000", labelKey: "settings.autoLockOptions.5min" },
  { value: "900000", labelKey: "settings.autoLockOptions.15min" },
  { value: "1800000", labelKey: "settings.autoLockOptions.30min" },
  { value: "3600000", labelKey: "settings.autoLockOptions.1hour" },
  { value: "0", labelKey: "settings.autoLockOptions.never" },
];

type Theme = "light" | "dark" | "system";

interface SectionProps {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
  anchor?: string;
}

function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
  anchor,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      data-tour={anchor}
      className="min-w-0 space-y-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
          <Icon
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <div>
          <h2 id={`${id}-heading`} className="text-xl font-semibold">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

function SettingsIndexPage() {
  const { t, i18n } = useTranslation(["common", "settings"]);
  const navigate = useNavigate();
  const { tab: searchTab } = Route.useSearch();
  const tab = searchTab ?? "account";
  const tabListRef = useRef<HTMLDivElement>(null);
  const { user, isLoading: isAuthLoading } = useAuthState();

  useEffect(() => {
    tabListRef.current
      ?.querySelector<HTMLElement>('[data-state="active"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  const handleTabChange = useCallback(
    (nextTab: string) => {
      navigate({
        to: "/dashboard/settings",
        search: { tab: nextTab as SettingsTab },
        replace: true,
      });
    },
    [navigate],
  );

  const [isSaving, setIsSaving] = useState(false);
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || "system",
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name || "" },
  });

  const applyTheme = useCallback((newTheme: Theme) => {
    const root = document.documentElement;
    if (newTheme === "system") {
      localStorage.removeItem("theme");
      const systemDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      root.classList.toggle("dark", systemDark);
    } else {
      localStorage.setItem("theme", newTheme);
      root.classList.toggle("dark", newTheme === "dark");
    }
    setTheme(newTheme);
  }, []);

  const [autoLockMs, setAutoLockMs] = useState<string>(
    () => localStorage.getItem(AUTO_LOCK_KEY) || "900000",
  );
  const [persistDays, setPersistDays] = useState<string>(() =>
    String(getPersistentUnlockDays()),
  );

  const handlePersistChange = useCallback(
    (value: string) => {
      const days = Number(value) as 0 | 7 | 30;
      setPersistDays(value);
      void setPersistentUnlockDays(days);
      toast.success(
        days === 0
          ? t(
              "settings.persistentUnlockOff",
              "Persistent unlock turned off. You'll enter your master password next time.",
            )
          : t(
              "settings.persistentUnlockUpdated",
              "Persistent unlock updated. Applies next time you unlock.",
            ),
      );
    },
    [t],
  );
  // Deferred device-enrollment retry card: shown when a prior
  // background enrollment gave up. Wiped on success.
  const [enrollmentDeferred, setEnrollmentDeferred] = useState(false);
  const [enrollmentRetrying, setEnrollmentRetrying] = useState(false);
  useEffect(() => {
    setEnrollmentDeferred(isEnrollmentDeferred());
  }, []);
  const handleEnrollmentRetry = useCallback(async () => {
    setEnrollmentRetrying(true);
    const ok = await enrollDeviceInBackground();
    setEnrollmentRetrying(false);
    setEnrollmentDeferred(isEnrollmentDeferred());
    toast[ok ? "success" : "error"](
      ok
        ? t(
            "settings.sections.devices.enrollment.retrySuccess",
            "Device setup complete.",
          )
        : t(
            "settings.sections.devices.enrollment.retryFailed",
            "Device setup still failing. Please try again shortly.",
          ),
    );
  }, [t]);

  useEffect(() => {
    vaultCrypto.setAutoLockTimeout(Number(autoLockMs));
  }, [autoLockMs]);

  const handleAutoLockChange = useCallback(
    (value: string) => {
      setAutoLockMs(value);
      localStorage.setItem(AUTO_LOCK_KEY, value);
      toast.success(t("settings.autoLockUpdated", "Auto-lock timer updated"));
    },
    [t],
  );

  const onSubmit = async (data: ProfileFormData) => {
    setIsSaving(true);
    try {
      await trpcMutation("user", "updateProfile", { name: data.name });
      toast.success(
        t("settings.profileUpdated", "Profile updated successfully"),
      );
      reset(data);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings.profileUpdateError", "Failed to update profile"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const getInitials = (name: string): string =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const formatDate = (timestamp: number): string =>
    new Date(timestamp).toLocaleDateString(i18n.language, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const tabDefinitions = [
    {
      value: "account",
      icon: User,
      label: t("settings.sections.account.title", "Account"),
    },
    {
      value: "security",
      icon: Shield,
      label: t("settings.sections.security.title", "Security"),
    },
    {
      value: "devices",
      icon: Users,
      label: t("settings.sections.devices.title", "Devices & Extensions"),
    },
    {
      value: "data",
      icon: Database,
      label: t("settings.sections.data.title", "Data"),
    },
    {
      value: "preferences",
      icon: Sliders,
      label: t("settings.sections.preferences.title", "Preferences"),
    },
  ] satisfies Array<{
    value: SettingsTab;
    icon: LucideIcon;
    label: string;
  }>;

  if (isAuthLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-36 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <Tabs value={tab} onValueChange={handleTabChange} className="min-w-0">
        <TabsList
          ref={tabListRef}
          aria-label={t("settings.title", "Settings")}
          className="mb-6 h-auto flex w-full max-w-full justify-start overflow-x-auto md:justify-start md:overflow-x-auto"
        >
          {tabDefinitions.map(({ value, icon: Icon, label }) => (
            <TabsTrigger key={value} value={value} className="gap-2">
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
              {value === "devices" && enrollmentDeferred && (
                <>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                    aria-hidden="true"
                  />
                  <span className="sr-only">
                    {t(
                      "settings.sections.devices.enrollment.title",
                      "Finish device setup",
                    )}
                  </span>
                </>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="account" className="mt-0">
          <Section
            id="section-account"
            icon={User}
            title={t("settings.sections.account.title", "Account")}
            description={t(
              "settings.sections.account.description",
              "Your profile, language and appearance.",
            )}
          >
            {/* Profile Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {t("settings.profile", "Profile")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "settings.profileDescription",
                    "Manage your display name and personal information",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                    <div className="shrink-0 self-center sm:self-start">
                      <Avatar className="h-16 w-16">
                        <AvatarFallback className="bg-primary/10 text-primary text-lg font-medium">
                          {user?.name ? getInitials(user.name) : "?"}
                        </AvatarFallback>
                      </Avatar>
                    </div>

                    <div className="flex-1 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="settings-name">
                          {t("settings.displayName", "Display name")}
                        </Label>
                        <div className="relative">
                          <User
                            className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <Input
                            id="settings-name"
                            type="text"
                            placeholder={t(
                              "settings.displayNamePlaceholder",
                              "Your name",
                            )}
                            className="ps-10 min-h-[44px]"
                            {...register("name")}
                            aria-invalid={errors.name ? "true" : "false"}
                            aria-describedby={
                              errors.name ? "settings-name-error" : undefined
                            }
                          />
                        </div>
                        {errors.name && (
                          <p
                            id="settings-name-error"
                            className="text-sm text-destructive"
                          >
                            {t(errors.name.message ?? "validation.required")}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="settings-email">
                          {t("settings.email", "Email")}
                        </Label>
                        <Input
                          id="settings-email"
                          type="email"
                          value={user?.email || ""}
                          disabled
                          className="bg-muted min-h-[44px]"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "settings.emailReadonly",
                            "Email cannot be changed from here",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={isSaving || !isDirty}
                      className="min-h-[44px] rounded-md"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 me-2 animate-spin" />
                          {t("settings.saving", "Saving...")}
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 me-2" />
                          {t("settings.saveProfile", "Save changes")}
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Language */}
            <LanguagePreference />

            {/* Theme */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {t("settings.theme", "Theme")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "settings.themeDescription",
                    "Choose how the application looks",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1 w-fit">
                  <Button
                    type="button"
                    variant={theme === "light" ? "default" : "ghost"}
                    size="sm"
                    className="min-h-[44px] min-w-[44px] rounded-md gap-1.5"
                    onClick={() => applyTheme("light")}
                    aria-label={t("settings.themeLight", "Light")}
                    aria-pressed={theme === "light"}
                  >
                    <Sun className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">
                      {t("settings.themeLight", "Light")}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={theme === "dark" ? "default" : "ghost"}
                    size="sm"
                    className="min-h-[44px] min-w-[44px] rounded-md gap-1.5"
                    onClick={() => applyTheme("dark")}
                    aria-label={t("settings.themeDark", "Dark")}
                    aria-pressed={theme === "dark"}
                  >
                    <Moon className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">
                      {t("settings.themeDark", "Dark")}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={theme === "system" ? "default" : "ghost"}
                    size="sm"
                    className="min-h-[44px] min-w-[44px] rounded-md gap-1.5"
                    onClick={() => applyTheme("system")}
                    aria-label={t("settings.themeSystem", "System")}
                    aria-pressed={theme === "system"}
                  >
                    <Monitor className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">
                      {t("settings.themeSystem", "System")}
                    </span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Member Since (moved from old Account card) */}
            <Card>
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {t("settings.memberSince", "Member since")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {user?.createdAt ? formatDate(user.createdAt) : "-"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Section>
        </TabsContent>

        <TabsContent value="security" className="mt-0">
          <Section
            id="section-security"
            icon={Shield}
            title={t("settings.sections.security.title", "Security")}
            description={t(
              "settings.sections.security.description",
              "Two-factor, passkeys, sessions, trusted devices and emergency access.",
            )}
          >
            <ProtectionExplainer variant="full" />

            <Card data-tour="settings-security">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {t("settings.sections.security.title", "Security")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "security.description",
                    "Manage two-factor authentication, passkeys, sessions and trusted devices.",
                    { ns: "settings" },
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "settings.sections.security.explainer",
                      "2FA, passkeys, active sessions and the devices you trust.",
                    )}
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] w-full min-w-0 gap-1.5 whitespace-normal text-center sm:w-auto"
                >
                  <Link to="/dashboard/settings/security">
                    {t(
                      "settings.sections.security.cta",
                      "Open security settings",
                    )}
                    <ArrowRight
                      className="ms-1 h-4 w-4 shrink-0 rtl:scale-x-[-1]"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Emergency access entry (sub-route stays at settings/emergency) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {t(
                    "settings.sections.security.emergencyTitle",
                    "Emergency access",
                  )}
                </CardTitle>
                <CardDescription>
                  {t(
                    "settings.sections.security.emergencyDescription",
                    "Nominate trusted contacts who can request access to your vault if you're incapacitated.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                    <LifeBuoy className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "settings.sections.security.emergencyExplainer",
                      "Waiting-period recovery, without giving up zero-knowledge.",
                    )}
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] w-full min-w-0 gap-1.5 whitespace-normal text-center sm:w-auto"
                >
                  <Link
                    to="/dashboard/settings/emergency"
                    search={{ tab: "contacts" }}
                  >
                    {t(
                      "settings.sections.security.emergencyCta",
                      "Manage emergency access",
                    )}
                    <ArrowRight
                      className="ms-1 h-4 w-4 shrink-0 rtl:scale-x-[-1]"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Persistent unlock — the vault stays unlocked at rest, wrapped
            under a non-extractable browser key. Master password still
            required for sensitive actions (export, master-password change,
            emergency access). */}
            <Card data-tour="unlock-remember">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {t(
                    "settings.persistentUnlock",
                    "Stay unlocked on this device",
                  )}
                </CardTitle>
                <CardDescription>
                  {t(
                    "settings.persistentUnlockDescription",
                    "Stay unlocked on this device — you'll confirm your master password for sensitive actions.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="settings-persistent-unlock">
                      {t(
                        "settings.persistentUnlock",
                        "Stay unlocked on this device",
                      )}
                    </Label>
                  </div>
                  <Select
                    value={persistDays}
                    onValueChange={handlePersistChange}
                  >
                    <SelectTrigger
                      id="settings-persistent-unlock"
                      className="min-h-[44px] w-full sm:w-[200px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">
                        {t("settings.persistentUnlockOptions.off", "Off")}
                      </SelectItem>
                      <SelectItem value="7">
                        {t("settings.persistentUnlockOptions.7days", "7 days")}
                      </SelectItem>
                      <SelectItem value="30">
                        {t(
                          "settings.persistentUnlockOptions.30days",
                          "30 days",
                        )}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Auto-lock — inactivity timer only. With persistent unlock on, the
            re-unlock after inactivity is silent (no prompt). */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {t(
                    "settings.inactivityLock",
                    "Require unlock after inactivity",
                  )}
                </CardTitle>
                <CardDescription>
                  {t(
                    "settings.inactivityLockDescription",
                    "With persistent unlock on, re-unlock after inactivity is silent — no prompt.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="settings-auto-lock">
                      {t(
                        "settings.inactivityLock",
                        "Require unlock after inactivity",
                      )}
                    </Label>
                  </div>
                  <Select
                    value={autoLockMs}
                    onValueChange={handleAutoLockChange}
                  >
                    <SelectTrigger
                      id="settings-auto-lock"
                      className="min-h-[44px] w-full sm:w-[200px]"
                    >
                      <SelectValue
                        placeholder={t(
                          "settings.selectDuration",
                          "Select duration",
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {autoLockOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {t(opt.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </Section>
        </TabsContent>

        <TabsContent value="devices" className="mt-0">
          <Section
            id="section-devices"
            icon={Users}
            title={t("settings.sections.devices.title", "Devices")}
            description={t(
              "settings.sections.devices.description",
              "Review devices trusted by your account.",
            )}
          >
            {enrollmentDeferred && (
              <Card
                data-tour="finish-device-setup"
                className="border-amber-300 dark:border-amber-700"
              >
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    {t(
                      "settings.sections.devices.enrollment.title",
                      "Finish device setup",
                    )}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      "settings.sections.devices.enrollment.description",
                      "This device isn't fully registered yet. Retry now so it can decrypt shared vault items.",
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleEnrollmentRetry}
                    disabled={enrollmentRetrying}
                    className="min-h-[44px]"
                  >
                    {enrollmentRetrying ? (
                      <>
                        <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                        {t(
                          "settings.sections.devices.enrollment.retrying",
                          "Retrying…",
                        )}
                      </>
                    ) : (
                      t(
                        "settings.sections.devices.enrollment.retry",
                        "Finish device setup",
                      )
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {t(
                    "settings.sections.devices.trustedTitle",
                    "Trusted devices",
                  )}
                </CardTitle>
                <CardDescription>
                  {t(
                    "settings.sections.devices.trustedDescription",
                    "Review and revoke devices signed into your account.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "settings.sections.devices.trustedExplainer",
                      "Trusted devices are managed inside Security.",
                    )}
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] w-full min-w-0 gap-1.5 whitespace-normal text-center sm:w-auto"
                >
                  <Link to="/dashboard/settings/security">
                    {t(
                      "settings.sections.devices.trustedCta",
                      "Manage trusted devices",
                    )}
                    <ArrowRight
                      className="ms-1 h-4 w-4 shrink-0 rtl:scale-x-[-1]"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
              </CardContent>
            </Card>

          </Section>
        </TabsContent>

        <TabsContent value="data" className="mt-0">
          <Section
            id="section-data"
            icon={Database}
            title={t("settings.sections.data.title", "Data")}
            description={t(
              "settings.sections.data.description",
              "Import from other password managers and export your data.",
            )}
            anchor="settings-data"
          >
            <Card data-tour="settings-data">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {t("settings.sections.data.title", "Data")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "settings.sections.data.explainer",
                    "One place for imports, plain and encrypted vault exports, and your GDPR account-data bundle.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "settings.sections.data.subExplainer",
                      "Every export path lives here — nothing else in the app writes your data out.",
                    )}
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] w-full min-w-0 gap-1.5 whitespace-normal text-center sm:w-auto"
                >
                  <Link
                    to="/dashboard/settings/import-export"
                    search={{ tab: "import" }}
                  >
                    {t("settings.sections.data.cta", "Open Data")}
                    <ArrowRight
                      className="ms-1 h-4 w-4 shrink-0 rtl:scale-x-[-1]"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </Section>
        </TabsContent>

        <TabsContent value="preferences" className="mt-0">
          <Section
            id="section-preferences"
            icon={Sliders}
            title={t("settings.sections.preferences.title", "Preferences")}
            description={t(
              "settings.sections.preferences.description",
              "How the vault looks and behaves for you.",
            )}
          >
            {/* Layout / density */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {t(
                    "settings.sections.preferences.layoutTitle",
                    "Vault layout",
                  )}
                </CardTitle>
                <CardDescription>
                  {t(
                    "settings.sections.preferences.layoutDescription",
                    "Choose the vault view and density that suit you.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LayoutTemplatePreference />
              </CardContent>
            </Card>

            {/* Optional guided tours */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {t("settings.sections.preferences.guideMeTitle", "Guide me")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "settings.sections.preferences.guideMeDescription",
                    "Short in-app tours that walk you through the vault, sharing, and settings.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GuideMeToggle />
              </CardContent>
            </Card>

            {isGAEnabled ? <PrivacySettings /> : null}

          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
