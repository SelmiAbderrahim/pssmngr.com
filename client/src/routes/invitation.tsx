// Copyright (c) 2026 Password Manager contributors
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpcMutation } from "@/lib/api/trpc";
import { isApiError } from "@/lib/api/client";
import { translateServerError } from "@/lib/translateServerError";
import { useAuthState } from "@/providers/AuthProvider";

type InvitationState = "idle" | "loading" | "success" | "error";

interface AcceptInvitationResponse {
  organization: {
    id: string;
    name: string;
    logo: string | null;
    isFamily?: boolean;
  };
}

export const Route = createFileRoute("/invitation")({
  component: InvitationPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
});

function InvitationPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const { status, isLoading } = useAuthState();
  const [state, setState] = useState<InvitationState>("idle");
  const [error, setError] = useState<string | null>(null);
  const startedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || token.length < 5) {
      setState("error");
      setError(t("invitation.invalidToken"));
      return;
    }

    if (isLoading || status !== "authenticated") {
      return;
    }

    if (startedTokenRef.current === token) {
      return;
    }

    startedTokenRef.current = token;

    async function acceptInvitation() {
      setState("loading");
      setError(null);

      try {
        const result = await trpcMutation<AcceptInvitationResponse>(
          "organization",
          "acceptInvitation",
          { invitationId: token },
        );

        setState("success");
        toast.success(t("invitation.accepted"));
        if (result.organization.isFamily) {
          navigate({
            to: "/dashboard/family",
            search: { tab: "members" },
          });
        } else {
          navigate({
            to: "/dashboard/organization",
            search: { tab: "members" },
          });
        }
      } catch (err) {
        const message = isApiError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : t("invitation.genericError");

        setState("error");
        setError(translateServerError(message));
      }
    }

    acceptInvitation();
  }, [isLoading, navigate, status, t, token]);

  if (isLoading || state === "loading") {
    return (
      <InvitationShell>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-14 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("invitation.accepting")}
          </p>
        </CardContent>
      </InvitationShell>
    );
  }

  if (status !== "authenticated") {
    return (
      <InvitationShell>
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="h-6 w-6" aria-hidden="true" />
          </div>
          <CardTitle>{t("invitation.signInTitle")}</CardTitle>
          <CardDescription>{t("invitation.signInDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full min-h-[44px]"
            onClick={() =>
              navigate({ to: "/login", search: { invitation: token } })
            }
          >
            {t("invitation.signIn")}
          </Button>
          <Button
            variant="outline"
            className="w-full min-h-[44px]"
            onClick={() =>
              navigate({ to: "/register", search: { invitation: token } })
            }
          >
            {t("invitation.createAccount")}
          </Button>
        </CardContent>
      </InvitationShell>
    );
  }

  if (state === "success") {
    return (
      <InvitationShell>
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <CardTitle>{t("invitation.accepted")}</CardTitle>
          <CardDescription>{t("invitation.redirecting")}</CardDescription>
        </CardHeader>
      </InvitationShell>
    );
  }

  return (
    <InvitationShell>
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <CardTitle>{t("invitation.errorTitle")}</CardTitle>
        <CardDescription>{t("invitation.errorDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            {error ?? t("invitation.genericError")}
          </AlertDescription>
        </Alert>
        <Button className="w-full min-h-[44px]" onClick={() => navigate({ to: "/dashboard" })}>
          {t("invitation.backToDashboard")}
        </Button>
      </CardContent>
    </InvitationShell>
  );
}

function InvitationShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-lg border bg-card shadow-sm">
        {children}
      </Card>
    </main>
  );
}
