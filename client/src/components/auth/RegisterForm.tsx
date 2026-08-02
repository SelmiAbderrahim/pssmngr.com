// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Registration Form Component
 *
 * Vault-aware registration flow:
 * 1. User enters name, email, password
 * 2. Generate Secret Key (128-bit) and KDF salt (16 bytes)
 * 3. Derive vault key client-side (Argon2id)
 * 4. Register with better-auth
 * 5. Call auth.setupVault with base64-encoded salt
 * 6. Store vault key in memory, secret key + device keys in IndexedDB
 * 7. Show Recovery Kit with Secret Key
 * 8. Register device (X25519 keypair)
 */
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { translateServerError } from "@/lib/translateServerError";
import {
  createRegisterSchema,
  type RegisterFormData,
} from "@/lib/authValidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";
import { RecoveryKit } from "./RecoveryKit";
import { enrollDeviceInBackground } from "@/services/keypair-manager";
import { toast } from "sonner";
import { signUp } from "@/lib/auth";
import { authClient } from "@/lib/auth/auth-client";
import { trpcMutation } from "@/lib/api/trpc";
import {
  setDeviceKeyScope,
  setSecretKey as storeSecretKey,
} from "@/lib/device-keys";
import { storePendingVaultSetup } from "@/lib/pending-vault-setup";
import { deriveAuthenticationSecret } from "@/lib/auth-credential";
import {
  generateSecretKey,
  generateSalt,
  deriveVaultKey,
  secretKeyToBase32,
  uint8ToBase64,
} from "@/lib/vault-crypto";
import { vaultCrypto } from "@/services/vault-crypto";
import { SocialLoginButtons } from "./SocialLoginButtons";

type RegisterStep =
  "form" | "creating" | "emailVerification" | "recoveryKit" | "vaultSetupError";

function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const details = error as {
    message?: string;
    statusText?: string;
    code?: string;
    status?: number;
  };

  if (details.message && details.message !== fallback) {
    return details.message;
  }

  if (details.statusText && details.statusText !== fallback) {
    return details.statusText;
  }

  if (details.code) {
    return details.code;
  }

  return details.status ? `${fallback} (${details.status})` : fallback;
}

export interface RegisterFormProps {
  onRegistrationStart?: () => void;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  className?: string;
}

export function RegisterForm({
  onRegistrationStart,
  onSuccess,
  onError,
  className,
}: RegisterFormProps) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(["auth", "validation", "errors"]);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<RegisterStep>("form");
  const [secretKeyBase32, setSecretKeyBase32] = React.useState("");
  const [userEmail, setUserEmail] = React.useState("");
  const [vaultSetupError, setVaultSetupError] = React.useState<string | null>(
    null,
  );

  // Ref to hold intermediate vault data for retry after Phase 2 failure
  const vaultSetupDataRef = React.useRef<{
    vaultKey: Uint8Array;
    secretKey: Uint8Array;
    salt: Uint8Array;
    email: string;
    signUpResult: { token: string | null };
  } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(createRegisterSchema(t)),
    defaultValues: {
      email: "",
      name: "",
      lastName: "",
      password: "",
      confirmPassword: "",
    },
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

  const password = watch("password");

  const navigateToDashboard = React.useCallback(() => {
    navigate({ to: "/dashboard" });
    onSuccess?.();
  }, [navigate, onSuccess]);

  /**
   * Phase 2: Vault setup operations (runs after account creation succeeds).
   * Extracted so it can be retried without re-registering.
   */
  const performVaultSetup = React.useCallback(
    async (params: {
      vaultKey: Uint8Array;
      secretKey: Uint8Array;
      salt: Uint8Array;
      email: string;
      token: string | null;
    }) => {
      const { vaultKey, secretKey, salt, email, token } = params;
      setDeviceKeyScope(email);

      // Store vault key in memory and create verification blob
      vaultCrypto.setKey(vaultKey);
      const encryptedVerificationBlob =
        await vaultCrypto.createVerificationBlob();
      const kdfSalt = uint8ToBase64(salt);
      const skBase32 = secretKeyToBase32(secretKey);

      const hasSession = token != null;

      if (!hasSession) {
        // No session — store vault setup data for completion after email
        // verification. The bundle is encrypted at rest (see pending-vault-setup).
        await storePendingVaultSetup({
          kdfSalt,
          encryptedVerificationBlob,
          secretKeyBase32: skBase32,
          email,
        });
        await storeSecretKey(secretKey);

        // Zero sensitive byte arrays
        secretKey.fill(0);
        salt.fill(0);

        setSecretKeyBase32(skBase32);
        setStep("emailVerification");
        return;
      }

      // Setup vault on server with salt + verification blob
      await trpcMutation("auth", "setupVault", {
        kdfSalt,
        encryptedVerificationBlob,
      });

      // Store secret key in IndexedDB for future logins
      await storeSecretKey(secretKey);

      // Show recovery kit with Secret Key in Base32
      setSecretKeyBase32(skBase32);

      // Zero sensitive byte arrays now that they're stored/used
      secretKey.fill(0);
      salt.fill(0);

      setStep("recoveryKit");
    },
    [],
  );

  /**
   * Retry vault setup after a Phase 2 failure.
   */
  const retryVaultSetup = React.useCallback(async () => {
    const data = vaultSetupDataRef.current;
    if (!data) return;

    setIsLoading(true);
    setVaultSetupError(null);
    setStep("creating");

    try {
      await performVaultSetup({
        vaultKey: data.vaultKey,
        secretKey: data.secretKey,
        salt: data.salt,
        email: data.email,
        token: data.signUpResult.token,
      });
    } catch (error) {
      console.error("[RegisterForm] Vault setup retry failed:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : t(
              "register.vaultSetupError.retryFailed",
              "Vault setup failed. Please try again.",
            );
      setVaultSetupError(errorMessage);
      setStep("vaultSetupError");
      onError?.(
        error instanceof Error ? error : new Error("Vault setup retry failed"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [performVaultSetup, t, onError]);

  const onSubmit = async (data: RegisterFormData) => {
    onRegistrationStart?.();
    setIsLoading(true);
    setServerError(null);
    setVaultSetupError(null);
    setStep("creating");
    setUserEmail(data.email);
    setDeviceKeyScope(data.email);

    // ── Phase 1: Account creation (key derivation + signUp) ──
    let vaultKey: Uint8Array;
    let secretKey: Uint8Array;
    let salt: Uint8Array;
    let signUpToken: string | null;

    try {
      // 1. Generate Secret Key and KDF salt
      secretKey = generateSecretKey();
      salt = generateSalt();

      // 2. Derive vault key with Argon2id
      const derived = await deriveVaultKey({
        masterPassword: data.password,
        secretKey,
        salt,
      });
      vaultKey = derived.vaultKey;

      // 3. Derive a domain-separated authentication secret. The server sees
      //    this opaque credential, never the master password or vault key.
      const authenticationSecret = await deriveAuthenticationSecret(vaultKey);

      // 4. Register with better-auth
      const fullName = `${data.name} ${data.lastName}`.trim();
      const result = await signUp.email({
        email: data.email,
        password: authenticationSecret,
        name: fullName,
        // After the user clicks the verification link, better-auth verifies the
        // token, auto-signs them in, then redirects here. Point at /login (which
        // forwards an authenticated session to /dashboard, mounting _app/_auth
        // and completing the pending vault setup) rather than the default "/"
        // marketing landing page.
        callbackURL: "/login",
      });

      // Handle error — but if user was created (data.user exists), proceed anyway
      if (result.error && !result.data?.user) {
        const fallback = t(
          "register.error.registrationFailed",
          "Registration failed",
        );
        throw new Error(
          translateServerError(getAuthErrorMessage(result.error, fallback)),
        );
      }

      signUpToken = result.data?.token ?? null;
    } catch (error) {
      // Phase 1 failure: no server state created — safe to return to form
      console.error("[RegisterForm] Registration error:", error);
      setStep("form");
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("register.error.unexpectedError", "An unexpected error occurred");
      setServerError(errorMessage);
      onError?.(
        error instanceof Error
          ? error
          : new Error(
              t("register.error.registrationFailed", "Registration failed"),
            ),
      );
      setIsLoading(false);
      return;
    }

    // ── Phase 2: Vault setup (account exists — never go back to form) ──

    // Save intermediate data for retry
    vaultSetupDataRef.current = {
      vaultKey,
      secretKey,
      salt,
      email: data.email,
      signUpResult: { token: signUpToken },
    };

    try {
      await performVaultSetup({
        vaultKey,
        secretKey,
        salt,
        email: data.email,
        token: signUpToken,
      });
    } catch (error) {
      // Phase 2 failure: account exists — show vault error with retry, NOT the form
      console.error("[RegisterForm] Vault setup error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : t(
              "register.vaultSetupError.generic",
              "Failed to set up your vault. Please try again.",
            );
      setVaultSetupError(errorMessage);
      setStep("vaultSetupError");
      onError?.(
        error instanceof Error ? error : new Error("Vault setup failed"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const isDisabled = isLoading || isSubmitting;

  // ── Recovery Kit View ──────────────────────────────────────────

  if (step === "recoveryKit") {
    return (
      <div className={cn("w-full", className)}>
        <RecoveryKit
          secretKeyBase32={secretKeyBase32}
          email={userEmail}
          onConfirm={() => {
            setSecretKeyBase32("");
            // Device enrollment runs in the background — never blocks the vault.
            void enrollDeviceInBackground({
              onFailure: () =>
                toast.warning(
                  t(
                    "login.enrollment.deferred",
                    "Device setup didn't finish. Retry from Settings → Devices.",
                  ),
                ),
            });
            navigateToDashboard();
          }}
        />
      </div>
    );
  }

  // ── Email Verification View (cloud mode, no auto-sign-in) ────

  if (step === "emailVerification") {
    return (
      <div
        className={cn("space-y-4 w-full text-center", className)}
        aria-label={t("register.emailVerification.title", "Verify Your Email")}
      >
        <Mail className="mx-auto h-10 w-10 text-primary" />
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">
            {t("register.emailVerification.title", "Verify Your Email")}
          </h3>
          <p
            className="text-sm text-muted-foreground"
            dangerouslySetInnerHTML={{
              __html: t(
                "register.emailVerification.description",
                "We've sent a verification link to <strong>{{email}}</strong>. Please check your inbox and click the link to complete your registration.",
                {
                  email: userEmail.replace(
                    /[&<>"']/g,
                    (c) =>
                      ({
                        "&": "&amp;",
                        "<": "&lt;",
                        ">": "&gt;",
                        '"': "&quot;",
                        "'": "&#39;",
                      })[c] || c,
                  ),
                  interpolation: { escapeValue: false },
                },
              ),
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "register.emailVerification.checkSpam",
              "Don't see it? Check your spam folder.",
            )}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isLoading}
          onClick={async () => {
            setIsLoading(true);
            setServerError(null);
            try {
              await authClient.sendVerificationEmail({
                email: userEmail,
                callbackURL: "/login",
              });
              setServerError(null);
              // Show success briefly via a temporary message
              const msg = t(
                "register.emailVerification.resendSuccess",
                "Verification email resent!",
              );
              setServerError(msg);
              setTimeout(() => setServerError(null), 3000);
            } catch {
              setServerError(
                t(
                  "register.emailVerification.resendError",
                  "Failed to resend verification email. Please try again.",
                ),
              );
            } finally {
              setIsLoading(false);
            }
          }}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
          ) : (
            <Mail className="h-4 w-4 me-1.5" />
          )}
          {t(
            "register.emailVerification.resendButton",
            "Resend Verification Email",
          )}
        </Button>

        {serverError && (
          <p className="text-sm text-muted-foreground">{serverError}</p>
        )}

        <button
          type="button"
          onClick={() => navigate({ to: "/login" })}
          className="flex min-h-[44px] w-full items-center justify-center rounded-md text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("register.emailVerification.backToLogin", "Back to Sign In")}
        </button>
      </div>
    );
  }

  // ── Vault Setup Error View (Phase 2 failure — account exists) ──

  if (step === "vaultSetupError") {
    return (
      <div
        className={cn("space-y-4 w-full text-center", className)}
        aria-label={t("register.vaultSetupError.title", "Vault Setup Failed")}
      >
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">
            {t("register.vaultSetupError.title", "Vault Setup Failed")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "register.vaultSetupError.description",
              "Your account was created, but we couldn't finish setting up your encrypted vault. Your data is safe — please retry.",
            )}
          </p>
          {vaultSetupError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive text-start"
            >
              {vaultSetupError}
            </div>
          )}
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={isLoading}
          onClick={retryVaultSetup}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
          ) : (
            <ShieldAlert className="h-4 w-4 me-1.5" />
          )}
          {t("register.vaultSetupError.retryButton", "Retry Vault Setup")}
        </Button>

        <button
          type="button"
          onClick={() => navigate({ to: "/login" })}
          className="flex min-h-[44px] w-full items-center justify-center rounded-md text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("register.vaultSetupError.backToLogin", "Back to Sign In")}
        </button>
      </div>
    );
  }

  // ── Creating Vault View ────────────────────────────────────────

  if (step === "creating") {
    return (
      <div
        className={cn("space-y-4 w-full text-center", className)}
        aria-label={t("register.creating.title", "Creating Your Vault")}
      >
        <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin" />
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">
            {t("register.creating.title", "Creating Your Vault")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "register.creating.description",
              "Generating encryption keys. This may take a few seconds...",
            )}
          </p>
        </div>
      </div>
    );
  }

  // ── Registration Form View ─────────────────────────────────────

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("w-full max-w-md mx-auto space-y-4", className)}
      noValidate
      aria-label={t("register.formAriaLabel")}
    >
      {serverError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive text-start"
        >
          {serverError}
        </div>
      )}

      {/* Name Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="register-name" className="text-start">
            {t("register.firstName", "First Name")}
          </Label>
          <div className="relative">
            <User className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="register-name"
              type="text"
              placeholder={t("register.firstNamePlaceholder", "John")}
              autoComplete="given-name"
              disabled={isDisabled}
              aria-invalid={!!errors.name}
              aria-required="true"
              aria-describedby={errors.name ? "register-name-error" : undefined}
              className={cn("ps-10", errors.name && "border-destructive")}
              {...register("name")}
            />
          </div>
          {errors.name && (
            <p
              id="register-name-error"
              role="alert"
              className="text-sm text-destructive text-start"
            >
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="register-lastName" className="text-start">
            {t("register.lastName", "Last Name")}
          </Label>
          <div className="relative">
            <User className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="register-lastName"
              type="text"
              placeholder={t("register.lastNamePlaceholder", "Doe")}
              autoComplete="family-name"
              disabled={isDisabled}
              aria-invalid={!!errors.lastName}
              aria-required="true"
              aria-describedby={
                errors.lastName ? "register-lastName-error" : undefined
              }
              className={cn("ps-10", errors.lastName && "border-destructive")}
              {...register("lastName")}
            />
          </div>
          {errors.lastName && (
            <p
              id="register-lastName-error"
              role="alert"
              className="text-sm text-destructive text-start"
            >
              {errors.lastName.message}
            </p>
          )}
        </div>
      </div>

      {/* Email Field */}
      <div className="grid gap-2">
        <Label htmlFor="register-email" className="text-start">
          {t("register.email", "Email")}
        </Label>
        <div className="relative">
          <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="register-email"
            type="email"
            placeholder={t("register.emailPlaceholder", "john@example.com")}
            autoComplete="email"
            disabled={isDisabled}
            aria-invalid={!!errors.email}
            aria-required="true"
            aria-describedby={errors.email ? "register-email-error" : undefined}
            className={cn("ps-10", errors.email && "border-destructive")}
            {...register("email")}
          />
        </div>
        {errors.email && (
          <p
            id="register-email-error"
            role="alert"
            className="text-sm text-destructive text-start"
          >
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password Field */}
      <div className="grid gap-2">
        <Label htmlFor="register-password" className="text-start">
          {t("register.password", "Password")}
        </Label>
        <div className="relative">
          <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="register-password"
            type={showPassword ? "text" : "password"}
            placeholder={t("register.passwordPlaceholder", "••••••••")}
            autoComplete="new-password"
            disabled={isDisabled}
            aria-invalid={!!errors.password}
            aria-required="true"
            aria-describedby={
              errors.password ? "register-password-error" : undefined
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
            id="register-password-error"
            role="alert"
            className="text-sm text-destructive text-start"
          >
            {errors.password.message}
          </p>
        )}
        <PasswordStrengthIndicator
          password={password || ""}
          showRequirements={true}
        />
      </div>

      {/* Confirm Password Field */}
      <div className="grid gap-2">
        <Label htmlFor="register-confirm-password" className="text-start">
          {t("register.confirmPassword", "Confirm Password")}
        </Label>
        <div className="relative">
          <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="register-confirm-password"
            type={showConfirmPassword ? "text" : "password"}
            placeholder={t("register.confirmPasswordPlaceholder", "••••••••")}
            autoComplete="new-password"
            disabled={isDisabled}
            aria-invalid={!!errors.confirmPassword}
            aria-required="true"
            aria-describedby={
              errors.confirmPassword
                ? "register-confirmPassword-error"
                : undefined
            }
            className={cn(
              "ps-10 pe-11",
              errors.confirmPassword && "border-destructive",
            )}
            {...register("confirmPassword")}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute end-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={
              showConfirmPassword
                ? t("common.hidePassword", "Hide password")
                : t("common.showPassword", "Show password")
            }
          >
            {showConfirmPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.confirmPassword && (
          <p
            id="register-confirmPassword-error"
            role="alert"
            className="text-sm text-destructive text-start"
          >
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isDisabled}>
        {isLoading
          ? t("register.creatingAccount", "Creating account...")
          : t("register.signUpButton", "Sign Up")}
      </Button>

      {/* Social sign-up skips this form's vault setup; CreateVaultGate in
          _auth.tsx collects the master password after the OAuth redirect. */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">
            {t("login.orContinueWith", "Or continue with")}
          </span>
        </div>
      </div>

      <SocialLoginButtons mode="register" disabled={isDisabled} />
    </form>
  );
}

export default RegisterForm;
