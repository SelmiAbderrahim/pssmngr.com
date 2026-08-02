// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * UserAuthGuard Component
 *
 * A route guard component that protects user/customer routes.
 * Ensures user is authenticated.
 *
 * Features:
 * - Checks user authentication status via AuthProvider
 * - Shows loading state while checking auth
 * - Redirects unauthenticated users to login
 */

import { useNavigate } from "@tanstack/react-router";
import { useEffect, ReactNode } from "react";
import { useAuthState } from "@/providers/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { User, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

interface UserAuthGuardProps {
  /**
   * Child components to render when user is authorized
   */
  children: ReactNode;

  /**
   * Optional redirect path for unauthenticated users
   * @default "/login"
   */
  redirectTo?: string;

  /**
   * Optional custom loading component
   */
  loadingComponent?: ReactNode;

  /**
   * Optional custom unauthenticated component
   */
  unauthenticatedComponent?: ReactNode;
}

/**
 * Default loading component
 */
function DefaultLoading() {
  const { t } = useTranslation("auth");
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <User className="h-12 w-12 text-muted-foreground" />
        </div>
        <div className="space-y-2 text-center">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32 mx-auto" />
        </div>
        <p className="text-sm text-muted-foreground">
          {t("guard.verifying", "Verifying your access...")}
        </p>
      </div>
    </div>
  );
}

/**
 * Default unauthenticated component
 */
function DefaultUnauthenticated() {
  const { t } = useTranslation("auth");
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <div className="rounded-full bg-muted p-4">
          <LogIn className="h-8 w-8 text-muted-foreground" />
        </div>
        <Alert className="border-muted">
          <AlertTitle className="text-lg font-semibold">
            {t("guard.authRequired", "Authentication Required")}
          </AlertTitle>
          <AlertDescription className="mt-2">
            {t("guard.loginPrompt", "Please log in to access this page. You will be redirected to the login page shortly.")}
          </AlertDescription>
        </Alert>
        <Button asChild variant="default">
          <Link to="/login">{t("guard.loginButton", "Log In Now")}</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * UserAuthGuard Component
 *
 * Protects user routes by requiring authenticated user role.
 */
export function UserAuthGuard({
  children,
  redirectTo = "/login",
  loadingComponent,
  unauthenticatedComponent,
}: UserAuthGuardProps) {
  const navigate = useNavigate();
  const { user, isLoading, status } = useAuthState();

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && status !== "authenticated") {
      const timer = setTimeout(() => {
        navigate({ to: redirectTo });
      }, 1500); // Brief delay to show unauthenticated message

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status, isLoading, navigate, redirectTo]);

  // Loading state
  if (isLoading) {
    return loadingComponent ?? <DefaultLoading />;
  }

  // Not authenticated
  if (status !== "authenticated" || !user) {
    return unauthenticatedComponent ?? <DefaultUnauthenticated />;
  }

  // Authorized - render children
  return <>{children}</>;
}

export default UserAuthGuard;
