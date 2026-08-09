// Copyright (c) 2026 Password Manager contributors
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useMemo } from "react";
import { Lock } from "lucide-react";
import { Logo } from "@/ui/logo";
import { LanguageSwitcher } from "@/ui/language-switcher";
import { useTranslation } from "react-i18next";

const HOME_PATH = "/";

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

export const Route = createFileRoute("/_app/login/_layout")({
  component: LoginLayout,
});

function LoginLayout() {
  const { t } = useTranslation("auth");

  // Random quote selected on each component mount (page visit)
  const randomQuote = useMemo(
    () => QUOTES[Math.floor(Math.random() * QUOTES.length)] ?? QUOTES[0]!,
    []
  );

  return (
    <div className="relative flex h-screen w-full">
      <div className="absolute start-1/2 top-10 mx-auto flex -translate-x-1/2 transform lg:hidden">
        <Link
          to={HOME_PATH}
          className="z-10 flex h-11 w-11 flex-col items-center justify-center gap-2"
          aria-label={t("common:app.name", "Password Manager")}
        >
          <Logo />
        </Link>
      </div>
      <div className="absolute end-4 top-6 z-10 lg:hidden">
        <LanguageSwitcher />
      </div>
      <div className="relative hidden h-full w-[50%] flex-col justify-between overflow-hidden bg-card p-10 lg:flex">
        <Link to={HOME_PATH} className="z-10 flex h-10 w-10 items-center gap-1">
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
      <div className="flex h-full w-full flex-col border-s border-primary/5 bg-card lg:w-[50%]">
        <Outlet />
      </div>
    </div>
  );
}
