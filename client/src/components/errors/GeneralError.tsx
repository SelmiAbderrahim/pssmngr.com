// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { Link, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface GeneralErrorProps {
    error: Error;
}

export function GeneralError({ error }: GeneralErrorProps) {
    const router = useRouter();
    const { t } = useTranslation("errors");

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <div className="flex justify-center mb-4">
                        <div className="rounded-full bg-destructive/10 p-3 shrink-0">
                            <AlertTriangle className="h-10 w-10 text-destructive shrink-0" />
                        </div>
                    </div>
                    <CardTitle className="text-xl sm:text-2xl break-words">{t("pages.generalError.title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-muted-foreground break-words">
                        {t("pages.generalError.description")}
                    </p>
                    {process.env.NODE_ENV === "development" && (
                        <div className="rounded-md bg-muted p-4 text-start">
                            <p className="text-xs font-mono text-destructive break-all max-h-[200px] overflow-auto">
                                {error.message}
                            </p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row justify-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => router.invalidate()}
                        className="w-full sm:w-auto min-h-[44px] gap-2"
                    >
                        <RotateCcw className="h-4 w-4 shrink-0" />
                        <span className="truncate">{t("pages.generalError.tryAgain")}</span>
                    </Button>
                    <Button asChild className="w-full sm:w-auto min-h-[44px]">
                        <Link to="/">
                            <span className="truncate">{t("pages.generalError.goHome")}</span>
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
