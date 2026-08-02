// Copyright (c) 2026 Password Manager contributors
/**
 * Login Page
 *
 * Login page for Password Manager dashboard using better-auth.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthState } from "@/providers/AuthProvider";
import { useTranslation } from "react-i18next";
import { LoginForm } from "@/components/auth/LoginForm";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getSession } from "@/lib/auth/auth-client";

/**
 * Accept a post-login `redirect` only when it is a safe internal path: it must
 * start with a single "/" (rejecting absolute URLs and protocol-relative "//x"
 * that would enable an open redirect). Returns undefined otherwise.
 */
function sanitizeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

export const Route = createFileRoute("/_app/login/_layout/")({
  component: Login,
  validateSearch: (
    search: Record<string, unknown>,
  ): { invitation?: string; redirect?: string; error?: string } => ({
    invitation:
      typeof search.invitation === "string" && search.invitation
        ? search.invitation
        : undefined,
    redirect: sanitizeRedirect(search.redirect),
    // OAuth failures redirect back here as /login?error=<code> (better-auth
    // errorCallbackURL). Only presence matters; the code is not displayed.
    error:
      typeof search.error === "string" && search.error
        ? search.error
        : undefined,
  }),
});

function Login() {
  const navigate = useNavigate();
  const { invitation, redirect, error: oauthError } = Route.useSearch();
  const { t } = useTranslation("auth");
  const { status, isLoading } = useAuthState();

  // After auth, return to the deep-link we came from (for example, a shared
  // pairing page), else a pending invitation, else the dashboard. The redirect
  // is a validated internal path that carries its own search params, so a hard
  // navigation is used to preserve them (and re-run the auth guard cleanly).
  const navigateToDestination = () => {
    if (redirect) {
      window.location.assign(redirect);
    } else if (invitation) {
      navigate({ to: "/invitation", search: { token: invitation } });
    } else {
      navigate({ to: "/dashboard" });
    }
  };

  // Redirect authenticated users to appropriate dashboard.
  // Verify with the server first to avoid redirect loops when the
  // client-side session is stale after a 401 redirect.
  useEffect(() => {
    if (!isLoading && status === "authenticated") {
      getSession()
        .then((fresh: any) => {
          if (!fresh?.data?.user) return; // session is actually expired — show login form
          if (redirect) {
            window.location.assign(redirect);
          } else if (invitation) {
            navigate({ to: "/invitation", search: { token: invitation } });
          } else {
            navigate({ to: "/dashboard" });
          }
        })
        .catch(() => {
          // Server says session is invalid — stay on login page
        });
    }
  }, [isLoading, status, navigate, invitation, redirect]);

  return (
    <div className="mx-auto flex h-full w-full max-w-96 flex-col items-center justify-center gap-6 px-4 pt-24 lg:pt-0">
      <div className="w-full space-y-2 text-center">
        <h3 className="text-2xl font-semibold tracking-tight text-primary">
          {t("login.continueTitle", "Welcome Back")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            "login.welcomeSubtitle",
            "Sign in to continue to Password Manager",
          )}
        </p>
      </div>

      {oauthError && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>
            {t(
              "login.error.socialFailed",
              "Social sign-in failed. Please try again or use your email and password.",
            )}
          </AlertDescription>
        </Alert>
      )}

      <LoginForm onSuccess={navigateToDestination} />

      {/* Register Link */}
      <div className="text-center text-sm text-muted-foreground">
        <span>{t("login.noAccount", "Don't have an account?")} </span>
        <Button
          variant="link"
          className="min-h-[44px] px-1"
          onClick={() =>
            navigate({ to: "/register", search: { invitation, redirect } })
          }
        >
          {t("login.signUpLink", "Sign up")}
        </Button>
      </div>
    </div>
  );
}
