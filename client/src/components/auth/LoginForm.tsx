// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Login Form Component
 *
 * Vault-aware login flow (step machine: form | secretKeyPrompt | twoFactor):
 * 1. Form submit → fetch KDF salt → known device derives, unknown device
 *    prompts for Secret Key. Argon2id derivation lives inside the submit
 *    button's pending state — no separate "deriving" screen.
 * 2. If 2FA enabled → TOTP challenge (blocking).
 * 3. Vault key → memory, navigate to vault, kick off `enrollDeviceInBackground`
 *    — failure surfaces a toast + a Settings retry card, never blocks vault.
 */
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  Key,
  Loader2,
  Fingerprint,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { translateServerError } from "@/lib/translateServerError";
import { createLoginSchema, type LoginFormData } from "@/lib/authValidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { signIn } from "@/lib/auth";
import { authClient } from "@/lib/auth/auth-client";
import { trpcQuery } from "@/lib/api/trpc";
import {
  getSecretKey,
  setSecretKey,
  clearDeviceKeys,
  setDeviceKeyScope,
} from "@/lib/device-keys";
import {
  deriveVaultKey,
  base32ToSecretKey,
  base64ToUint8,
} from "@/lib/vault-crypto";
import { vaultCrypto } from "@/services/vault-crypto";
import { enrollDeviceInBackground } from "@/services/keypair-manager";
import { toast } from "sonner";
import { SocialLoginButtons } from "./SocialLoginButtons";
import { deriveAuthenticationSecret } from "@/lib/auth-credential";

// Derivation runs within the submit button's
// pending state; device enrollment runs as background work after navigation.
type LoginStep = "form" | "secretKeyPrompt" | "twoFactor";

type VaultLoginMetadata = {
  salt: string;
  encryptedVerificationBlob: string | null;
};

const isInvalidSecretKeyError = (error: unknown) =>
  error instanceof Error && /Secret key must be at least/i.test(error.message);

export interface LoginFormProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  className?: string;
}

export function LoginForm({ onSuccess, onError, className }: LoginFormProps) {
  const { t, i18n } = useTranslation(["auth", "errors", "validation"]);
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<LoginStep>("form");
  const [totpCode, setTotpCode] = React.useState("");
  const [secretKeyInput, setSecretKeyInput] = React.useState("");

  // Check if WebAuthn/passkeys are supported
  const isPasskeySupported = React.useMemo(
    () => typeof window !== "undefined" && !!window.PublicKeyCredential,
    [],
  );

  // Store form data and crypto keys between steps (e.g. across 2FA challenge)
  const pendingLoginRef = React.useRef<LoginFormData | null>(null);
  const pendingVaultKeyRef = React.useRef<Uint8Array | null>(null);
  const pendingSecretKeyRef = React.useRef<Uint8Array | null>(null);
  const pendingVaultMetadataRef = React.useRef<VaultLoginMetadata | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(createLoginSchema(t)),
    defaultValues: { email: "", password: "", rememberMe: false },
    mode: "onBlur",
  });

  const previousLanguage = React.useRef(i18n.resolvedLanguage);
  React.useEffect(() => {
    if (
      previousLanguage.current !== i18n.resolvedLanguage &&
      Object.keys(errors).length > 0
    ) {
      void trigger();
    }
    previousLanguage.current = i18n.resolvedLanguage;
  }, [errors, i18n.resolvedLanguage, trigger]);

  const navigateAfterLogin = React.useCallback(async () => {
    navigate({ to: "/dashboard" });
    onSuccess?.();
  }, [navigate, onSuccess]);

  // ── Passkey Login ─────────────────────────────────────────────

  const handlePasskeyLogin = React.useCallback(async () => {
    setIsPasskeyLoading(true);
    setServerError(null);

    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) {
        throw new Error(
          translateServerError(
            result.error.message ||
              t("login.error.passkeyFailed", "Passkey authentication failed"),
          ),
        );
      }
      await navigateAfterLogin();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Don't show error for user cancellation
      if (
        message.includes("cancelled") ||
        message.includes("canceled") ||
        message.includes("NotAllowedError") ||
        message.includes("AbortError")
      ) {
        return;
      }
      setServerError(
        t("login.error.passkeyFailed", "Passkey authentication failed"),
      );
      onError?.(
        error instanceof Error ? error : new Error("Passkey login failed"),
      );
    } finally {
      setIsPasskeyLoading(false);
    }
  }, [navigateAfterLogin, onError, t]);

  // ── Conditional Mediation (autofill passkey) ─────────────────

  React.useEffect(() => {
    if (!isPasskeySupported) return;
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      return;
    }

    let cancelled = false;

    const tryConditionalMediation = async () => {
      try {
        const hasWebAuthnInput = document.querySelector(
          'input[autocomplete~="webauthn"]',
        );
        if (!hasWebAuthnInput) return;

        const isAvailable = await (
          PublicKeyCredential as any
        ).isConditionalMediationAvailable?.();
        if (!isAvailable || cancelled) return;

        const result = await authClient.signIn.passkey({ autoFill: true });
        if (!cancelled && result && !result.error) {
          await navigateAfterLogin();
        }
      } catch {
        // Silently ignore — conditional mediation is best-effort
      }
    };

    tryConditionalMediation();

    return () => {
      cancelled = true;
    };
  }, [isPasskeySupported, navigateAfterLogin]);

  // Enrollment runs in the background after navigation; failure surfaces a
  // toast + a "Finish device setup" card in Settings, never blocks the vault.
  const completeLogin = React.useCallback(async () => {
    await navigateAfterLogin();
    void enrollDeviceInBackground({
      onFailure: () =>
        toast.warning(
          t(
            "login.enrollment.deferred",
            "Device setup didn't finish. Retry from Settings → Devices.",
          ),
        ),
    });
  }, [navigateAfterLogin, t]);

  // ── TOTP Verification ──────────────────────────────────────────

  const handleTotpVerify = React.useCallback(async () => {
    if (totpCode.length !== 6) return;
    setIsLoading(true);
    setServerError(null);

    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: totpCode,
      });
      if (result.error) {
        throw new Error(
          translateServerError(
            result.error.message ||
              t("login.error.invalidCode", "Invalid verification code"),
          ),
        );
      }

      // 2FA verified — now formally unlock the vault
      const pendingKey = pendingVaultKeyRef.current;
      if (pendingKey) {
        vaultCrypto.setKey(pendingKey);
        pendingVaultKeyRef.current = null;
      }

      // Store secret key for future logins on this device
      const pendingSecret = pendingSecretKeyRef.current;
      if (pendingSecret) {
        await setSecretKey(pendingSecret);
        pendingSecretKeyRef.current = null;
      }

      pendingLoginRef.current = null;
      await completeLogin();
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("login.error.invalidCode", "Invalid verification code");
      setServerError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [totpCode, completeLogin, navigateAfterLogin, t]);

  // ── Vault Key Derivation + Auth ────────────────────────────────

  const performVaultLogin = React.useCallback(
    async (
      data: LoginFormData,
      secretKey: Uint8Array,
      fromStorage = false,
      metadata?: VaultLoginMetadata,
    ) => {
      setDeviceKeyScope(data.email);
      setIsLoading(true);
      setServerError(null);

      try {
        // 1. Fetch KDF salt and verification blob from server
        const vaultMetadata =
          metadata ??
          (await trpcQuery<VaultLoginMetadata>("auth", "getSalt", {
            email: data.email,
          }));
        pendingVaultMetadataRef.current = vaultMetadata;
        const salt = base64ToUint8(vaultMetadata.salt);

        // 2. Derive vault key with Argon2id
        const { vaultKey } = await deriveVaultKey({
          masterPassword: data.password,
          secretKey,
          salt,
        });

        // 3. Verify the derived key without installing it globally. Installing
        //    and then clearing the same Uint8Array would zero the candidate
        //    before the authentication secret is derived.
        if (vaultMetadata.encryptedVerificationBlob) {
          const isValid = await vaultCrypto.verifyVaultKeyWithKey(
            vaultKey,
            vaultMetadata.encryptedVerificationBlob,
          );
          if (!isValid) {
            if (fromStorage) {
              // Stale stored key — clear it and fall back to manual entry
              try {
                await clearDeviceKeys();
              } catch {
                /* best-effort cleanup */
              }
              setStep("secretKeyPrompt");
              setServerError(
                t(
                  "login.error.staleSecretKey",
                  "Your stored device key appears outdated. Please enter your Secret Key from your recovery kit.",
                ),
              );
              setSecretKeyInput("");
              return;
            }
            throw new Error(
              t(
                "login.error.wrongCredentials",
                "Wrong password or Secret Key. Please check both and try again.",
              ),
            );
          }
        }

        // 4. Authenticate with a domain-separated secret derived from the
        //    vault key. The master password never crosses the network.
        const authenticationSecret = await deriveAuthenticationSecret(vaultKey);
        const result = await signIn.email({
          email: data.email,
          password: authenticationSecret,
          rememberMe: data.rememberMe,
        });

        if (result.error) {
          throw new Error(
            translateServerError(
              result.error.message ||
                t("login.error.loginFailed", "Login failed"),
            ),
          );
        }

        // 5. Check for 2FA challenge BEFORE setting vault key
        if ((result.data as any)?.twoFactorRedirect) {
          // Store vault key and secret key in refs for after 2FA verification
          pendingVaultKeyRef.current = vaultKey;
          pendingSecretKeyRef.current = secretKey;
          setStep("twoFactor");
          setIsLoading(false);
          return;
        }

        // 6. No 2FA — formally unlock vault (with notification)
        vaultCrypto.setKey(vaultKey);

        // Clear pending credentials from ref
        pendingLoginRef.current = null;
        pendingVaultMetadataRef.current = null;

        // 7. Store secret key on this device for next login
        await setSecretKey(secretKey);

        // 8. Complete login (device enrollment check)
        await completeLogin();
      } catch (error) {
        setStep("form");
        const errorMessage = isInvalidSecretKeyError(error)
          ? t(
              "login.error.invalidSecretKey",
              "Invalid Secret Key. Please check your recovery kit and try again.",
            )
          : error instanceof Error
            ? error.message
            : t("login.error.unknownError", "An error occurred during sign-in");
        setServerError(errorMessage);
        onError?.(error instanceof Error ? error : new Error("Login failed"));
      } finally {
        setIsLoading(false);
      }
    },
    [completeLogin, onError, t],
  );

  // ── Secret Key Submission ──────────────────────────────────────

  const handleSecretKeySubmit = React.useCallback(async () => {
    const data = pendingLoginRef.current;
    if (!data || !secretKeyInput.trim()) return;
    setIsLoading(true);

    try {
      const secretKey = base32ToSecretKey(secretKeyInput.trim());
      await performVaultLogin(
        data,
        secretKey,
        false,
        pendingVaultMetadataRef.current ?? undefined,
      );
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : t("login.error.invalidSecretKey", "Invalid Secret Key format"),
      );
      setIsLoading(false);
    }
  }, [secretKeyInput, performVaultLogin, t]);

  // ── Form Submission ────────────────────────────────────────────

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setServerError(null);
    pendingLoginRef.current = data;
    setDeviceKeyScope(data.email);

    try {
      const vaultMetadata = await trpcQuery<VaultLoginMetadata>(
        "auth",
        "getSalt",
        {
          email: data.email,
        },
      );
      pendingVaultMetadataRef.current = vaultMetadata;

      if (!vaultMetadata.encryptedVerificationBlob) {
        pendingVaultMetadataRef.current = null;
        throw new Error(
          t(
            "login.error.vaultSetupIncomplete",
            "Vault setup is incomplete. Finish registration on the browser where it started, or use the social sign-in method linked to this account.",
          ),
        );
      }

      // Check if we have a stored secret key (returning device)
      const storedSecretKey = await getSecretKey();

      if (storedSecretKey) {
        // Known device — derive vault key directly
        await performVaultLogin(data, storedSecretKey, true, vaultMetadata);
      } else {
        // New device — prompt for secret key
        setStep("secretKeyPrompt");
        setIsLoading(false);
      }
    } catch (error) {
      const errorMessage = isInvalidSecretKeyError(error)
        ? t(
            "login.error.invalidSecretKey",
            "Invalid Secret Key. Please check your recovery kit and try again.",
          )
        : error instanceof Error
          ? error.message
          : t("login.error.unknownError", "An error occurred during sign-in");
      setServerError(errorMessage);
      onError?.(error instanceof Error ? error : new Error("Login failed"));
      setIsLoading(false);
    }
  };

  const isDisabled = isLoading || isSubmitting || isPasskeyLoading;

  // ── Secret Key Prompt View ─────────────────────────────────────

  if (step === "secretKeyPrompt") {
    return (
      <div
        className={cn("space-y-4 w-full", className)}
        aria-label={t("login.secretKey.title", "Enter Secret Key")}
      >
        {serverError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive text-start"
          >
            {serverError}
          </div>
        )}

        <div className="space-y-2 text-center">
          <Key className="mx-auto h-8 w-8 text-primary" />
          <h3 className="text-lg font-semibold">
            {t("login.secretKey.title", "Enter Secret Key")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "login.secretKey.description",
              "This device hasn't been used before. Enter your Secret Key from your recovery kit to unlock your vault.",
            )}
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="secret-key" className="text-start">
            {t("login.secretKey.label", "Secret Key")}
          </Label>
          <Input
            id="secret-key"
            type="text"
            value={secretKeyInput}
            onChange={(e) => setSecretKeyInput(e.target.value.toUpperCase())}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XX"
            className="font-mono tracking-wider text-center"
            disabled={isLoading}
            autoFocus
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground text-start">
            {t(
              "login.secretKey.hint",
              "Found in your recovery kit, formatted as groups separated by dashes.",
            )}
          </p>
        </div>

        <Button
          type="button"
          className="w-full h-11"
          disabled={!secretKeyInput.trim() || isLoading}
          onClick={handleSecretKeySubmit}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
              {t("common.status.loading", "Loading...")}
            </>
          ) : (
            t("login.secretKey.submit", "Unlock Vault")
          )}
        </Button>

        <button
          type="button"
          onClick={() => {
            setStep("form");
            setSecretKeyInput("");
            setServerError(null);
          }}
          className="flex min-h-[44px] w-full items-center justify-center rounded-md text-center text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("login.secretKey.back", "Back to login")}
        </button>
      </div>
    );
  }

  // ── 2FA Challenge View ─────────────────────────────────────────

  if (step === "twoFactor") {
    return (
      <div
        className={cn("space-y-4 w-full", className)}
        aria-label={t("login.twoFactor.title", "Two-Factor Authentication")}
      >
        {serverError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive text-start"
          >
            {serverError}
          </div>
        )}

        <div className="space-y-2 text-center">
          <Lock className="mx-auto h-8 w-8 text-primary" />
          <h3 className="text-lg font-semibold">
            {t("login.twoFactor.title", "Two-Factor Authentication")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "login.twoFactor.description",
              "Enter the 6-digit code from your authenticator app.",
            )}
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="totp-code" className="text-start">
            {t("login.twoFactor.codeLabel", "Verification Code")}
          </Label>
          <Input
            id="totp-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="000000"
            value={totpCode}
            onChange={(e) =>
              setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            className="text-center text-2xl tracking-widest font-mono"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            disabled={isLoading}
          />
        </div>

        <Button
          type="button"
          className="w-full h-11"
          disabled={totpCode.length !== 6 || isLoading}
          onClick={handleTotpVerify}
        >
          {isLoading
            ? t("common.status.loading", "Loading...")
            : t("login.twoFactor.verify", "Verify")}
        </Button>

        <button
          type="button"
          onClick={() => {
            // Clear pending crypto material when abandoning 2FA
            if (pendingVaultKeyRef.current) {
              pendingVaultKeyRef.current.fill(0);
              pendingVaultKeyRef.current = null;
            }
            pendingSecretKeyRef.current = null;
            pendingVaultMetadataRef.current = null;
            setStep("form");
            setTotpCode("");
            setServerError(null);
          }}
          className="flex min-h-[44px] w-full items-center justify-center rounded-md text-center text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("login.twoFactor.backToLogin", "Back to login")}
        </button>
      </div>
    );
  }

  // ── Login Form View ────────────────────────────────────────────

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("space-y-4 w-full", className)}
      noValidate
      aria-label={t("login.title", "Login")}
    >
      {serverError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive text-start"
        >
          {serverError}
        </div>
      )}

      <div className="grid gap-4">
        {/* Email Field */}
        <div className="grid gap-2">
          <Label htmlFor="login-email" className="text-start">
            {t("login.email", "Email")}
          </Label>
          <div className="relative">
            <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="login-email"
              type="email"
              placeholder={t("login.emailPlaceholder", "Enter your email")}
              autoComplete="username webauthn"
              disabled={isDisabled}
              aria-invalid={!!errors.email}
              aria-required="true"
              aria-describedby={errors.email ? "login-email-error" : undefined}
              className={cn("ps-10", errors.email && "border-destructive")}
              {...register("email")}
            />
          </div>
          {errors.email && (
            <p
              id="login-email-error"
              role="alert"
              className="text-sm text-destructive text-start"
            >
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password Field */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password" className="text-start">
              {t("login.password", "Password")}
            </Label>
          </div>
          <div className="relative">
            <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder={t(
                "login.passwordPlaceholder",
                "Enter your password",
              )}
              autoComplete="current-password"
              disabled={isDisabled}
              aria-invalid={!!errors.password}
              aria-required="true"
              aria-describedby={
                errors.password ? "login-password-error" : undefined
              }
              className={cn(
                "ps-10 pe-11",
                errors.password && "border-destructive",
              )}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute end-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={
                showPassword
                  ? t("common.hidePassword", "Hide password")
                  : t("common.showPassword", "Show password")
              }
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p
              id="login-password-error"
              role="alert"
              className="text-sm text-destructive text-start"
            >
              {errors.password.message}
            </p>
          )}
        </div>
      </div>

      {/* Remember Me */}
      <div className="flex min-h-[44px] items-center gap-3">
        <Checkbox
          id="login-remember"
          disabled={isDisabled}
          checked={watch("rememberMe") ?? false}
          onCheckedChange={(checked) =>
            setValue("rememberMe", checked === true)
          }
        />
        <Label
          htmlFor="login-remember"
          className="flex min-h-[44px] cursor-pointer items-center text-sm font-normal"
        >
          {t("login.rememberMe", "Remember me")}
        </Label>
      </div>

      <Button type="submit" className="w-full h-11" disabled={isDisabled}>
        {isLoading
          ? t("common.status.loading", "Loading...")
          : t("login.signInButton", "Sign In")}
      </Button>

      {/* Alternative sign-in methods */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">
            {t("login.or", "or")}
          </span>
        </div>
      </div>

      {isPasskeySupported && (
        <Button
          type="button"
          variant="outline"
          className="w-full h-11"
          disabled={isDisabled}
          onClick={handlePasskeyLogin}
        >
          {isPasskeyLoading ? (
            <>
              <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
              {t("login.passkey.verifying", "Verifying...")}
            </>
          ) : (
            <>
              <Fingerprint className="h-4 w-4 me-1.5" />
              {t("login.passkey.signIn", "Sign in with passkey")}
            </>
          )}
        </Button>
      )}

      <SocialLoginButtons mode="login" disabled={isDisabled} />
    </form>
  );
}

export default LoginForm;
