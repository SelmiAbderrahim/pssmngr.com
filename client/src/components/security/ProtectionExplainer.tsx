// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * ProtectionExplainer
 *
 * Three-point "how pssmngr protects you" summary. Claims verified against
 * this codebase:
 *  - XChaCha20-Poly1305 envelope: client/src/services/vault-crypto.ts
 *  - Argon2id KDF + master password never sent: client/src/services/vault-crypto.ts
 *  - Persistent unlock 30d default: client/src/services/vault-crypto.ts
 *  - Sensitive actions re-ask master password: client/src/components/security/SensitiveActionGate.tsx
 */

import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Lock, KeyRound, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProtectionExplainerProps {
  variant: "full" | "compact";
  className?: string;
}

export function ProtectionExplainer({
  variant,
  className,
}: ProtectionExplainerProps) {
  const { t } = useTranslation();

  const points = [
    {
      icon: Lock,
      titleKey: "explainer.encryptedOnDevice.title",
      titleFallback: "Encrypted on your device",
      bodyKey: "explainer.encryptedOnDevice.body",
      bodyFallback: "Items are sealed with XChaCha20-Poly1305 before they leave.",
    },
    {
      icon: KeyRound,
      titleKey: "explainer.twoSecretsNeverSent.title",
      titleFallback: "Two secrets, never sent",
      bodyKey: "explainer.twoSecretsNeverSent.body",
      bodyFallback:
        "Your master password and Secret Key stay with you; we store neither, so we can't read your vault — and can't reset it either.",
    },
    {
      icon: ShieldCheck,
      titleKey: "explainer.youControlThisDevice.title",
      titleFallback: "You control this device",
      bodyKey: "explainer.youControlThisDevice.body",
      bodyFallback:
        "Stay unlocked for up to 30 days here; sensitive actions always re-ask for your master password.",
    },
  ] as const;

  const isCompact = variant === "compact";

  return (
    <section
      aria-labelledby="protection-explainer-title"
      data-testid={`protection-explainer-${variant}`}
      className={cn(
        "rounded-lg border bg-card",
        isCompact ? "p-4" : "p-6",
        className,
      )}
    >
      <h3
        id="protection-explainer-title"
        className={cn(
          "font-semibold",
          isCompact ? "text-sm mb-3" : "text-lg mb-4",
        )}
      >
        {t("explainer.title", "How pssmngr protects you")}
      </h3>

      <ol className={cn("flex flex-col", isCompact ? "gap-3" : "gap-4")}>
        {points.map(({ icon: Icon, titleKey, titleFallback, bodyKey, bodyFallback }, i) => (
          <li key={titleKey} className="flex items-start gap-3">
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-md bg-muted",
                isCompact ? "h-7 w-7" : "h-9 w-9",
              )}
              aria-hidden="true"
            >
              <Icon
                className={cn(
                  "text-muted-foreground",
                  isCompact ? "h-4 w-4" : "h-5 w-5",
                )}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "font-medium",
                  isCompact ? "text-sm" : "text-base",
                )}
              >
                <span className="me-1 text-muted-foreground tabular-nums">
                  {i + 1}.
                </span>
                {t(titleKey, titleFallback)}
              </p>
              <p
                className={cn(
                  "text-muted-foreground",
                  isCompact ? "text-xs mt-0.5" : "text-sm mt-1",
                )}
              >
                {t(bodyKey, bodyFallback)}
              </p>
              {i === 2 && (
                <Link
                  to="/dashboard/settings"
                  search={{ tab: "security" }}
                  hash="section-security"
                  className={cn(
                    "inline-block mt-1 text-primary underline-offset-4 hover:underline",
                    isCompact ? "text-xs" : "text-sm",
                  )}
                  data-testid="protection-explainer-unlock-link"
                >
                  {t("explainer.youControlThisDevice.link", "Change unlock setting")}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
