// Copyright (c) 2026 Password Manager contributors
/**
 * Register Page Route
 *
 * Registration page for Password Manager dashboard using better-auth.
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { Loader2, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuthState } from "@/providers/AuthProvider";
import { Logo } from "@/ui/logo";
import { LanguageSwitcher } from "@/ui/language-switcher";
import { RegisterForm } from "@/components/auth/RegisterForm";

/**
 * Accept a post-auth `redirect` only when it is a safe internal path (starts
 * with a single "/"), rejecting absolute / protocol-relative URLs to avoid an
 * open redirect.
 */
function sanitizeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

export const Route = createFileRoute("/_app/register")({
  component: Register,
  validateSearch: (
    search: Record<string, unknown>
  ): { invitation?: string; redirect?: string } => ({
    invitation:
      typeof search.invitation === "string" && search.invitation
        ? search.invitation
        : undefined,
    redirect: sanitizeRedirect(search.redirect),
  }),
});

const QUOTES = [
  "vaultYourKeys",
  "onlyYouHoldTheKey",
  "zeroKnowledgeByDesign",
  "encryptedBeforeLeaving",
  "endToEndEncrypted",
  "weNeverSeePasswords",
  "oneMasterPassword",
  "strongEncryption",
  "yourPasswordsYourControl",
  "privateByDefault",
  "peaceOfMind",
  "truPrivacy",
];

function Register() {
  const navigate = useNavigate();
  const { invitation, redirect } = Route.useSearch();
  const { status, isLoading } = useAuthState();
  const isRegistering = useRef(false);
  const { t } = useTranslation("auth");

  const randomQuote = useMemo(
    () => QUOTES[Math.floor(Math.random() * QUOTES.length)] ?? QUOTES[0]!,
    []
  );

  // After auth, return to the deep-link we came from (for example, a shared
  // pairing page), else the pending invitation, else the dashboard. The
  // redirect is a validated internal path carrying its own search params, so a
  // hard navigation preserves them and re-runs the auth guard cleanly.
  const navigateToDestination = () => {
    if (redirect) {
      window.location.assign(redirect);
    } else if (invitation) {
      navigate({ to: "/invitation", search: { token: invitation } });
    } else {
      navigate({ to: "/dashboard" });
    }
  };

  // Redirect if already authenticated (skip during active registration flow)
  useEffect(() => {
    if (!isLoading && status === "authenticated" && !isRegistering.current) {
      if (redirect) {
        window.location.assign(redirect);
      } else if (invitation) {
        navigate({ to: "/invitation", search: { token: invitation } });
      } else {
        navigate({ to: "/dashboard" });
      }
    }
  }, [isLoading, status, navigate, invitation, redirect]);

  // Show loading state while checking auth (skip during active registration
  // to prevent unmounting RegisterForm and losing its in-flight state)
  if (isLoading && !isRegistering.current) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-full">
      {/* Left branding panel - hidden on mobile */}
      <div className="relative hidden h-full w-[50%] flex-col justify-between overflow-hidden bg-card p-10 lg:flex">
        <Link to="/" className="z-10 flex h-10 w-10 items-center gap-1">
          <Logo />
        </Link>

        <div className="z-10 flex flex-col items-start gap-3">
          <Lock className="h-5 w-5 text-primary" />
          <p className="text-lg sm:text-xl font-medium text-foreground">
            {t(`quotes.${randomQuote}`)}
          </p>
        </div>

        <div className="z-10 absolute top-4 end-4">
          <LanguageSwitcher />
        </div>

        <div className="base-grid absolute start-0 top-0 z-0 h-full w-full opacity-40" />
      </div>

      {/* Right panel - form */}
      <div className="flex h-full w-full flex-col border-s border-primary/5 bg-card lg:w-[50%]">
        <div className="absolute start-1/2 top-10 mx-auto flex -translate-x-1/2 transform lg:hidden">
          <Link
            to="/"
            className="z-10 flex h-11 w-11 flex-col items-center justify-center gap-2"
            aria-label={t("common:app.name", "Password Manager")}
          >
            <Logo />
          </Link>
        </div>
        <div className="absolute end-4 top-6 z-10 lg:hidden">
          <LanguageSwitcher />
        </div>

        <div className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-8 overflow-y-auto">
          {/* Header */}
          <div className="w-full space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-primary">
              {t("register.title", "Create Account")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("register.subtitle", "Sign up to get started with Password Manager")}
            </p>
          </div>

          {/* Registration Form - uses production component with better-auth */}
          <RegisterForm
            onRegistrationStart={() => { isRegistering.current = true; }}
            onSuccess={navigateToDestination}
          />

          {/* Already have account link */}
          <div className="flex flex-row items-center gap-2 text-sm text-muted-foreground">
            <span>{t("register.hasAccount", "Already have an account?")}</span>
            <Link
              to="/login"
              search={{ invitation, redirect }}
              className="inline-flex min-h-[44px] items-center rounded-md text-primary hover:underline"
            >
              {t("register.signInLink", "Sign in")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
