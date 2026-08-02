// Copyright (c) 2026 Password Manager contributors
/**
 * Ephemeral Share Access Page
 *
 * Public route for recipients to access an ephemeral sharing link.
 * Extracts the decryption key from the URL fragment (never sent to server),
 * fetches the encrypted blob, and decrypts client-side.
 */

import { useState, useCallback, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ShieldCheck,
  Loader2,
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  Link2Off,
} from "lucide-react";
import { trpcMutation } from "@/lib/api/trpc";
import { copySensitiveText } from "@/lib/clipboard";
import type { EphemeralAccessData } from "@pssmngr/crypto";

interface CachedEphemeralAccess {
  promise: Promise<EphemeralAccessData>;
}

const ephemeralAccessRequests = new Map<string, CachedEphemeralAccess>();

function accessEphemeralLinkOnce(linkId: string): Promise<EphemeralAccessData> {
  const cached = ephemeralAccessRequests.get(linkId);
  if (cached) return cached.promise;

  const entry: CachedEphemeralAccess = {
    promise: trpcMutation<EphemeralAccessData>(
      "sharing",
      "accessEphemeralLink",
      { linkId },
    ),
  };
  ephemeralAccessRequests.set(linkId, entry);
  entry.promise
    .finally(() => {
      window.setTimeout(() => {
        if (ephemeralAccessRequests.get(linkId) === entry) {
          ephemeralAccessRequests.delete(linkId);
        }
      }, 1000);
    })
    // The cleanup chain must not surface an unhandled rejection — the real
    // error is propagated to callers via the returned entry.promise below.
    .catch(() => {});

  return entry.promise;
}

export const Route = createFileRoute("/share/$linkId")({
  component: EphemeralShareAccessPage,
});

type PageState = "loading" | "passphrase" | "decrypted" | "error";

interface DecryptedField {
  key: string;
  value: string;
  sensitive: boolean;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "cardNumber",
  "cvv",
  "pin",
  "securityCode",
  "totp",
]);

function EphemeralShareAccessPage() {
  const { t } = useTranslation();
  const { linkId } = Route.useParams();

  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [accessData, setAccessData] = useState<EphemeralAccessData | null>(
    null,
  );
  const [linkKey, setLinkKey] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [fields, setFields] = useState<DecryptedField[]>([]);
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Extract link key from URL fragment on mount
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (!fragment) {
      setError(
        t("ephemeral.errorNoKey", "Invalid link: missing decryption key."),
      );
      setState("error");
      return;
    }
    setLinkKey(fragment);
  }, [t]);

  // Fetch encrypted blob from server
  useEffect(() => {
    if (!linkKey) return;
    let cancelled = false;

    async function fetchLink() {
      try {
        const data = await accessEphemeralLinkOnce(linkId);
        if (cancelled) return;
        setAccessData(data);

        if (data.hasPassphrase) {
          setState("passphrase");
        } else {
          // Decrypt immediately
          await decrypt(data, linkKey!);
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: string }).message)
              : t("ephemeral.errorAccess", "This link is no longer available.");
        setError(message);
        setState("error");
      }
    }

    fetchLink();
    return () => {
      cancelled = true;
    };
  }, [linkId, linkKey]);

  const decrypt = useCallback(
    async (data: EphemeralAccessData, key: string, pass?: string) => {
      setIsDecrypting(true);
      try {
        const { decryptEphemeralShare } = await import("@pssmngr/crypto");
        const plaintext = await decryptEphemeralShare(data, key, pass);
        const parsed = JSON.parse(plaintext) as Record<string, unknown>;

        const decryptedFields: DecryptedField[] = Object.entries(parsed)
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => ({
            key: k,
            value: String(v),
            sensitive: SENSITIVE_KEYS.has(k),
          }));

        setFields(decryptedFields);
        setState("decrypted");
      } catch {
        setError(
          t(
            "ephemeral.errorDecrypt",
            "Decryption failed. Wrong passphrase or corrupted link.",
          ),
        );
        setState(data.hasPassphrase ? "passphrase" : "error");
      } finally {
        setIsDecrypting(false);
      }
    },
    [t],
  );

  const handlePassphraseSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!accessData || !linkKey) return;
      setError(null);

      if (!passphrase.trim()) {
        setError(
          t("ephemeral.errorNoPassphrase", "Please enter the passphrase."),
        );
        return;
      }

      await decrypt(accessData, linkKey, passphrase);
    },
    [accessData, linkKey, passphrase, decrypt, t],
  );

  const toggleFieldVisibility = useCallback((key: string) => {
    setVisibleFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleCopyField = useCallback(async (key: string, value: string) => {
    // SECURITY (Round 4, fix #31): schedules a 30s clipboard auto-wipe
    await copySensitiveText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const formatFieldLabel = (key: string): string => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
  };

  return (
    <>
      <Helmet>
        <title>{t("ephemeral.pageTitle", "Shared Item")} | pssmngr</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-lg border bg-card shadow-sm">
          {/* Loading */}
          {state === "loading" && (
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                {t("ephemeral.loading", "Loading shared item...")}
              </p>
            </CardContent>
          )}

          {/* Error */}
          {state === "error" && (
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Link2Off className="h-10 w-10 text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold mb-2">
                {t("ephemeral.errorTitle", "Link Unavailable")}
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                {error ||
                  t(
                    "ephemeral.errorGeneric",
                    "This link may have expired, been revoked, or already been used.",
                  )}
              </p>
            </CardContent>
          )}

          {/* Passphrase prompt */}
          {state === "passphrase" && (
            <>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">
                  <Lock className="h-8 w-8 text-muted-foreground" />
                </div>
                <CardTitle className="text-lg">
                  {t("ephemeral.passphraseRequired", "Passphrase Required")}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {t(
                    "ephemeral.passphrasePrompt",
                    "This item is protected with a passphrase. Enter it to decrypt.",
                  )}
                </p>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handlePassphraseSubmit}
                  className="flex flex-col gap-4"
                >
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="access-passphrase">
                      {t("ephemeral.passphrase", "Passphrase")}
                    </Label>
                    <Input
                      id="access-passphrase"
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder={t(
                        "ephemeral.enterPassphrase",
                        "Enter passphrase...",
                      )}
                      disabled={isDecrypting}
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isDecrypting || !passphrase.trim()}
                  >
                    {isDecrypting ? (
                      <>
                        <Loader2 className="h-4 w-4 me-2 animate-spin" />
                        {t("ephemeral.decrypting", "Decrypting...")}
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4 me-2" />
                        {t("ephemeral.decrypt", "Decrypt")}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {/* Decrypted content */}
          {state === "decrypted" && (
            <>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                  <CardTitle className="text-lg">
                    {t("ephemeral.decryptedTitle", "Shared Item")}
                  </CardTitle>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(
                    "ephemeral.decryptedHint",
                    "This data was decrypted locally in your browser.",
                  )}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {fields.map((field) => {
                    const fieldLabel = formatFieldLabel(field.key);
                    const fieldId = `shared-field-${encodeURIComponent(field.key)}`;
                    return (
                      <div key={field.key} className="flex flex-col gap-1">
                        <Label
                          htmlFor={fieldId}
                          className="text-xs text-muted-foreground"
                        >
                          {fieldLabel}
                        </Label>
                        <div className="flex items-center gap-1">
                          <Input
                            id={fieldId}
                            readOnly
                            type={
                              field.sensitive && !visibleFields.has(field.key)
                                ? "password"
                                : "text"
                            }
                            value={field.value}
                            className="font-mono text-sm"
                          />
                          {field.sensitive && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="flex-shrink-0 h-9 w-9"
                              onClick={() => toggleFieldVisibility(field.key)}
                              aria-label={
                                visibleFields.has(field.key)
                                  ? t("a11y.hideField", "Hide {{field}}", {
                                      field: fieldLabel,
                                    })
                                  : t("a11y.showField", "Show {{field}}", {
                                      field: fieldLabel,
                                    })
                              }
                            >
                              {visibleFields.has(field.key) ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="flex-shrink-0 h-9 w-9"
                            onClick={() =>
                              handleCopyField(field.key, field.value)
                            }
                            aria-label={t(
                              "a11y.copyField",
                              "Copy {{field}}",
                              {
                                field: fieldLabel,
                              },
                            )}
                          >
                            {copiedField === field.key ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
