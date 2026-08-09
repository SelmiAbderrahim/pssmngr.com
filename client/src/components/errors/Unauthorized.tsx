// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";

export function Unauthorized() {
    const { t } = useTranslation("errors");

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <div className="flex justify-center mb-4">
                        <div className="rounded-full bg-muted p-3 shrink-0">
                            <Lock className="h-10 w-10 text-muted-foreground shrink-0" />
                        </div>
                    </div>
                    <CardTitle className="text-xl sm:text-2xl break-words">{t("pages.unauthorized.title", "Access Denied")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground break-words">
                        {t("pages.unauthorized.description", "You don't have permission to access this page.")}
                    </p>
                </CardContent>
                <CardFooter className="flex justify-center">
                    <Button asChild className="min-h-[44px] w-full sm:w-auto">
                        <Link to="/login">
                            <span className="truncate">{t("pages.unauthorized.login", "Log In")}</span>
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
