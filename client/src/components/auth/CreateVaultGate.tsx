// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Create Vault Gate
 *
 * First-time vault setup for an authenticated user who has a LOGIN account but
 * no encrypted vault yet. This happens for org members whose accounts were
 * provisioned by an invitation (they signed in with a temporary password but
 * never went through the registration vault-setup step).
 *
 * Mirrors Phase 2 of RegisterForm (the session-present branch):
 *   1. User chooses a master password (distinct from their login password)
 *   2. Generate Secret Key (128-bit) + KDF salt, derive vault key (Argon2id)
 *   3. Call auth.setupVault with base64 salt + verification blob
 *   4. Store vault key in memory, secret key in IndexedDB
 *   5. Show Recovery Kit (Secret Key) → Device Enrollment → done
 *
 * The master password and secret key never leave the browser (zero-knowledge).
 */
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Lock, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";
import { RecoveryKit } from "./RecoveryKit";
import { enrollDeviceInBackground } from "@/services/keypair-manager";
import { createPasswordSchema } from "@/lib/authValidation";
import { trpcMutation } from "@/lib/api/trpc";
import {
  setDeviceKeyScope,
  setSecretKey as storeSecretKey,
} from "@/lib/device-keys";
import {
  generateSecretKey,
  generateSalt,
  deriveVaultKey,
  secretKeyToBase32,
  uint8ToBase64,
} from "@/lib/vault-crypto";
import { vaultCrypto } from "@/services/vault-crypto";

type GateStep = "form" | "creating" | "recoveryKit" | "error";

export interface CreateVaultGateProps {
  /** The authenticated user's email (shown in the Recovery Kit). */
  email: string;
  /** Called once the vault is set up and onboarding is complete. */
  onComplete: () => void;
  className?: string;
}

export function CreateVaultGate({ email, onComplete, className }: CreateVaultGateProps) {
  const { t, i18n } = useTranslation(["auth", "validation"]);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [step, setStep] = React.useState<GateStep>("form");
  const [secretKeyBase32, setSecretKeyBase32] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Holds derived material so a Phase-2 failure can be retried without
  // re-deriving the key (and without re-prompting for the master password).
  const setupDataRef = React.useRef<{
    vaultKey: Uint8Array;
    secretKey: Uint8Array;
    salt: Uint8Array;
  } | null>(null);

  const schema = React.useMemo(
    () =>
      z
        .object({
          masterPassword: createPasswordSchema(t),
          confirmMasterPassword: z.string(),
        })
        .refine((d) => d.masterPassword === d.confirmMasterPassword, {
          message: t("validation:password.mismatch", "Passwords do not match"),
          path: ["confirmMasterPassword"],
        }),
    [t],
  );

  type FormData = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { masterPassword: "", confirmMasterPassword: "" },
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

  const masterPassword = watch("masterPassword");

  /** Persist the derived vault on the server and surface the recovery kit. */
  const finishSetup = React.useCallback(
    async (data: { vaultKey: Uint8Array; secretKey: Uint8Array; salt: Uint8Array }) => {
      setDeviceKeyScope(email);
      vaultCrypto.setKey(data.vaultKey);
      const encryptedVerificationBlob = await vaultCrypto.createVerificationBlob();
      const kdfSalt = uint8ToBase64(data.salt);
      const skBase32 = secretKeyToBase32(data.secretKey);

      await trpcMutation("auth", "setupVault", {
        kdfSalt,
        encryptedVerificationBlob,
      });

      await storeSecretKey(data.secretKey);

      // Zero sensitive byte arrays now that they're stored/used.
      data.secretKey.fill(0);
      data.salt.fill(0);
      setupDataRef.current = null;

      setSecretKeyBase32(skBase32);
      setStep("recoveryKit");
    },
    [],
  );

  const onSubmit = React.useCallback(
    async (form: FormData) => {
      setStep("creating");
      setError(null);
      setDeviceKeyScope(email);

      try {
        const secretKey = generateSecretKey();
        const salt = generateSalt();
        const { vaultKey } = await deriveVaultKey({
          masterPassword: form.masterPassword,
          secretKey,
          salt,
        });

        setupDataRef.current = { vaultKey, secretKey, salt };
        await finishSetup({ vaultKey, secretKey, salt });
      } catch (err) {
        console.error("[CreateVaultGate] Vault setup failed:", err);
        setError(
          err instanceof Error
            ? err.message
            : t("createVault.error.generic", "Failed to set up your vault. Please try again."),
        );
        setStep("error");
      }
    },
    [finishSetup, t],
  );

  const retry = React.useCallback(async () => {
    const data = setupDataRef.current;
    if (!data) {
      setStep("form");
      return;
    }
    setStep("creating");
    setError(null);
    try {
      await finishSetup(data);
    } catch (err) {
      console.error("[CreateVaultGate] Vault setup retry failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : t("createVault.error.retryFailed", "Vault setup failed. Please try again."),
      );
      setStep("error");
    }
  }, [finishSetup, t]);

  // ── Recovery Kit ──────────────────────────────────────────────
  if (step === "recoveryKit") {
    return (
      <RecoveryKit
        secretKeyBase32={secretKeyBase32}
        email={email}
        onConfirm={() => {
          setSecretKeyBase32("");
          // Device enrollment runs in the background — never blocks the vault.
          void enrollDeviceInBackground({
            onFailure: () => toast.warning(t("login.enrollment.deferred",
              "Device setup didn't finish. Retry from Settings → Devices.")),
          });
          onComplete();
        }}
      />
    );
  }

  // ── Creating ──────────────────────────────────────────────────
  if (step === "creating") {
    return (
      <div className={cn("space-y-4 w-full text-center", className)}>
        <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin" />
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">
            {t("createVault.creating.title", "Creating Your Vault")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "createVault.creating.description",
              "Generating encryption keys. This may take a few seconds...",
            )}
          </p>
        </div>
      </div>
    );
  }

  // ── Error (vault already partially created — retry) ───────────
  if (step === "error") {
    return (
      <div className={cn("space-y-4 w-full text-center", className)}>
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">
            {t("createVault.error.title", "Vault Setup Failed")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "createVault.error.description",
              "We couldn't finish setting up your encrypted vault. Please retry.",
            )}
          </p>
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive text-start"
            >
              {error}
            </div>
          )}
        </div>
        <Button type="button" className="w-full" onClick={retry}>
          <ShieldAlert className="h-4 w-4 me-1.5" />
          {t("createVault.error.retryButton", "Retry Vault Setup")}
        </Button>
      </div>
    );
  }

  // ── Master password form ──────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("w-full space-y-4", className)}
      noValidate
    >
      <div className="space-y-2 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
        <h3 className="text-lg font-semibold">
          {t("createVault.title", "Create Your Vault")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            "createVault.description",
            "Choose a master password to encrypt your vault. This is different from your sign-in password and is never sent to our servers — we cannot recover it for you.",
          )}
        </p>
      </div>

      {/* Master password */}
      <div className="grid gap-2">
        <Label htmlFor="create-vault-password" className="text-start">
          {t("createVault.masterPassword", "Master Password")}
        </Label>
        <div className="relative">
          <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="create-vault-password"
            type={showPassword ? "text" : "password"}
            placeholder={t("createVault.masterPasswordPlaceholder", "••••••••")}
            autoComplete="new-password"
            aria-invalid={!!errors.masterPassword}
            aria-required="true"
            aria-describedby={errors.masterPassword ? "create-vault-password-error" : undefined}
            className={cn("ps-10 pe-10", errors.masterPassword && "border-destructive")}
            {...register("masterPassword")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? t("common.hidePassword", "Hide password") : t("common.showPassword", "Show password")}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.masterPassword && (
          <p id="create-vault-password-error" role="alert" className="text-sm text-destructive text-start">
            {errors.masterPassword.message}
          </p>
        )}
        <PasswordStrengthIndicator password={masterPassword || ""} showRequirements={true} />
      </div>

      {/* Confirm master password */}
      <div className="grid gap-2">
        <Label htmlFor="create-vault-confirm" className="text-start">
          {t("createVault.confirmMasterPassword", "Confirm Master Password")}
        </Label>
        <div className="relative">
          <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="create-vault-confirm"
            type={showConfirm ? "text" : "password"}
            placeholder={t("createVault.confirmMasterPasswordPlaceholder", "••••••••")}
            autoComplete="new-password"
            aria-invalid={!!errors.confirmMasterPassword}
            aria-required="true"
            aria-describedby={errors.confirmMasterPassword ? "create-vault-confirm-error" : undefined}
            className={cn("ps-10 pe-10", errors.confirmMasterPassword && "border-destructive")}
            {...register("confirmMasterPassword")}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showConfirm ? t("common.hidePassword", "Hide password") : t("common.showPassword", "Show password")}
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.confirmMasterPassword && (
          <p id="create-vault-confirm-error" role="alert" className="text-sm text-destructive text-start">
            {errors.confirmMasterPassword.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full">
        {t("createVault.submit", "Create Vault")}
      </Button>
    </form>
  );
}

export default CreateVaultGate;
