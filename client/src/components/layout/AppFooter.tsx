// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useTranslation } from "react-i18next";

export function AppFooter() {
    const { t } = useTranslation("common");
    const currentYear = new Date().getFullYear();

    return (
        <footer className="border-t bg-muted/30 py-6 px-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
                <p>
                    {t("footer.copyright", { year: currentYear })}
                </p>
            </div>
        </footer>
    );
}
