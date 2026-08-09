// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Create Item Dialog
 *
 * Dialog for creating new vault items. Supports different item types
 * with type-specific form fields. All data is encrypted client-side
 * before being sent to the server.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Key,
  CreditCard,
  StickyNote,
  User,
  Fingerprint,
  ShieldCheck,
  File,
  Loader2,
  Plus,
  Wand2,
} from "lucide-react";
import type { DecryptedVaultItem, ItemType } from "./VaultItemCard";
import {
  matchPolicyForUrl,
  generatePasswordForPolicy,
} from "@/services/site-policies";
import { generatePassword } from "@/services/password-generator";
import { findExactVaultDuplicates } from "@/services/vault-duplicates";

interface CreateItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    itemType: ItemType,
    data: Record<string, unknown>,
  ) => Promise<void>;
  getExistingItems: () => Promise<DecryptedVaultItem[]>;
  initialItemType?: ItemType;
}

interface PendingSubmission {
  itemType: ItemType;
  data: Record<string, unknown>;
  duplicateCount: number | null;
}

const ITEM_TYPE_ICONS: Record<ItemType, React.ElementType> = {
  login: Key,
  card: CreditCard,
  note: StickyNote,
  identity: User,
  passkey: Fingerprint,
  totp: ShieldCheck,
  file: File,
};

const ITEM_TYPE_KEYS: ItemType[] = [
  "login",
  "card",
  "note",
  "identity",
  "passkey",
  "totp",
  "file",
];

const ITEM_TYPE_TRANSLATION_KEYS: Record<ItemType, string> = {
  login: "login",
  card: "card",
  note: "secureNote",
  identity: "identity",
  passkey: "passkey",
  totp: "totp",
  file: "file",
};

export function CreateItemDialog({
  open,
  onOpenChange,
  onSubmit,
  getExistingItems,
  initialItemType = "login",
}: CreateItemDialogProps) {
  const { t } = useTranslation(["common", "vault"]);
  const [itemType, setItemType] = useState<ItemType>(initialItemType);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSubmission, setPendingSubmission] =
    useState<PendingSubmission | null>(null);

  // Login fields
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  // Card fields
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const cardNumberRef = useRef<HTMLInputElement>(null);
  const cardCvvRef = useRef<HTMLInputElement>(null);

  // Identity fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // TOTP fields
  const [totpIssuer, setTotpIssuer] = useState("");
  const [totpAccount, setTotpAccount] = useState("");
  const [hasTotpSecret, setHasTotpSecret] = useState(false);
  const totpSecretRef = useRef<HTMLInputElement>(null);
  const [totpAlgorithm, setTotpAlgorithm] = useState("SHA1");
  const [totpDigits, setTotpDigits] = useState("6");
  const [totpPeriod, setTotpPeriod] = useState("30");

  // Match a policy preset based on the URL
  const suggestedPolicy = useMemo(
    () => (itemType === "login" && url ? matchPolicyForUrl(url) : undefined),
    [itemType, url],
  );

  const handleGeneratePassword = useCallback(() => {
    try {
      const generatedPassword = suggestedPolicy
        ? generatePasswordForPolicy(suggestedPolicy)
        : generatePassword({
            length: 16,
            uppercase: true,
            lowercase: true,
            digits: true,
            symbols: true,
          });
      if (passwordRef.current) passwordRef.current.value = generatedPassword;
    } catch {
      if (passwordRef.current) {
        passwordRef.current.value = generatePassword({
          length: 16,
          uppercase: true,
          lowercase: true,
          digits: true,
          symbols: true,
        });
      }
    }
  }, [suggestedPolicy]);

  const resetSecretInputs = useCallback(() => {
    if (passwordRef.current) passwordRef.current.value = "";
    if (cardNumberRef.current) cardNumberRef.current.value = "";
    if (cardCvvRef.current) cardCvvRef.current.value = "";
    if (totpSecretRef.current) totpSecretRef.current.value = "";
    setHasTotpSecret(false);
  }, []);

  const resetForm = useCallback(() => {
    setItemType(initialItemType);
    setTitle("");
    setUsername("");
    resetSecretInputs();
    setUrl("");
    setNotes("");
    setCardName("");
    setCardExpiry("");
    setFullName("");
    setEmail("");
    setPhone("");
    setTotpIssuer("");
    setTotpAccount("");
    setTotpAlgorithm("SHA1");
    setTotpDigits("6");
    setTotpPeriod("30");
    setPendingSubmission(null);
  }, [initialItemType, resetSecretInputs]);

  const getSecretInputs = useCallback(
    () => ({
      password: passwordRef.current?.value ?? "",
      cardNumber: cardNumberRef.current?.value ?? "",
      cardCvv: cardCvvRef.current?.value ?? "",
      totpSecret: totpSecretRef.current?.value ?? "",
    }),
    [],
  );

  useEffect(() => {
    if (open) setItemType(initialItemType);
  }, [initialItemType, open]);

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    },
    [onOpenChange, resetForm],
  );

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      let data: Record<string, unknown> = { title: title.trim() };
      const { password, cardNumber, cardCvv, totpSecret } = getSecretInputs();

      switch (itemType) {
        case "login":
          data = {
            ...data,
            username: username.trim(),
            password,
            url: url.trim(),
            notes: notes.trim(),
          };
          break;
        case "card":
          data = {
            ...data,
            name: cardName.trim(),
            number: cardNumber.trim(),
            expiry: cardExpiry.trim(),
            cvv: cardCvv,
          };
          break;
        case "identity":
          data = {
            ...data,
            fullName: fullName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            notes: notes.trim(),
          };
          break;
        case "totp":
          data = {
            ...data,
            issuer: totpIssuer.trim(),
            account: totpAccount.trim(),
            secret: totpSecret.trim().replace(/\s/g, "").toUpperCase(),
            algorithm: totpAlgorithm,
            digits: parseInt(totpDigits, 10),
            period: parseInt(totpPeriod, 10),
            notes: notes.trim(),
          };
          break;
        case "passkey":
          data = {
            ...data,
            credentialId: "",
            rpId: "",
            userHandle: "",
            publicKey: "",
            transports: [],
            createdAt: new Date().toISOString(),
            notes: notes.trim(),
          };
          break;
        case "note":
          data = { ...data, content: notes.trim() };
          break;
        default:
          data = { ...data, notes: notes.trim() };
      }

      let existingItems: DecryptedVaultItem[];
      try {
        existingItems = await getExistingItems();
      } catch {
        setPendingSubmission({ itemType, data, duplicateCount: null });
        return;
      }

      const duplicates = findExactVaultDuplicates(
        { itemType, data },
        existingItems,
      );
      if (duplicates.length > 0) {
        setPendingSubmission({
          itemType,
          data,
          duplicateCount: duplicates.length,
        });
        return;
      }

      await onSubmit(itemType, data);
      handleClose(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    itemType,
    title,
    username,
    url,
    notes,
    cardName,
    cardExpiry,
    fullName,
    email,
    phone,
    totpIssuer,
    totpAccount,
    totpAlgorithm,
    totpDigits,
    totpPeriod,
    getSecretInputs,
    getExistingItems,
    onSubmit,
    handleClose,
  ]);

  const handleAddAnyway = useCallback(async () => {
    if (!pendingSubmission) return;
    setIsSubmitting(true);
    try {
      await onSubmit(pendingSubmission.itemType, pendingSubmission.data);
      setPendingSubmission(null);
      handleClose(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [handleClose, onSubmit, pendingSubmission]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {t("vault.addItem", "Add Item")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "vault.addItemDescription",
                "Create a new item. All data is encrypted on your device.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Item Type Selector */}
            <div className="flex flex-col gap-2">
              <Label>{t("vault.itemType", "Type")}</Label>
              <Select
                value={itemType}
                onValueChange={(v) => setItemType(v as ItemType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPE_KEYS.map((typeKey) => {
                    const TypeIcon = ITEM_TYPE_ICONS[typeKey];
                    return (
                      <SelectItem key={typeKey} value={typeKey}>
                        <span className="flex items-center gap-2">
                          <TypeIcon className="h-4 w-4" />
                          {t(
                            `vault:itemTypes.${ITEM_TYPE_TRANSLATION_KEYS[typeKey]}`,
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Title (all types) */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="item-title">{t("vault.title", "Title")}</Label>
              <Input
                id="item-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t(
                  "vault.titlePlaceholder",
                  "e.g. GitHub, Bank, etc.",
                )}
                aria-required="true"
                autoFocus
              />
            </div>

            {/* Login Fields */}
            {itemType === "login" && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-username">
                    {t("vault.username", "Username")}
                  </Label>
                  <Input
                    id="item-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t(
                      "vault.usernamePlaceholder",
                      "user@example.com",
                    )}
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="item-password">
                      {t("vault.password", "Password")}
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto py-1 px-2 text-xs text-muted-foreground"
                      onClick={handleGeneratePassword}
                    >
                      <Wand2 className="h-3 w-3 me-1" />
                      {t("vault.generate", "Generate")}
                    </Button>
                  </div>
                  <Input
                    ref={passwordRef}
                    id="item-password"
                    type="password"
                    autoComplete="new-password"
                  />
                  {suggestedPolicy && (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "vault.policySuggestion",
                        "Using {{policy}} password policy",
                        { policy: suggestedPolicy.name },
                      )}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-url">{t("vault.url", "URL")}</Label>
                  <Input
                    id="item-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    autoComplete="off"
                  />
                </div>
              </>
            )}

            {/* Card Fields */}
            {itemType === "card" && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="card-name">
                    {t("vault.cardholderName", "Cardholder Name")}
                  </Label>
                  <Input
                    id="card-name"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="card-number">
                    {t("vault.cardNumber", "Card Number")}
                  </Label>
                  <Input
                    ref={cardNumberRef}
                    id="card-number"
                    placeholder="1234 5678 9012 3456"
                    autoComplete="off"
                    inputMode="numeric"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="card-expiry">
                      {t("vault.expiry", "Expiry")}
                    </Label>
                    <Input
                      id="card-expiry"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      placeholder="MM/YY"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="card-cvv">{t("vault.cvv", "CVV")}</Label>
                    <Input
                      ref={cardCvvRef}
                      id="card-cvv"
                      type="password"
                      placeholder="***"
                      autoComplete="off"
                      inputMode="numeric"
                      maxLength={4}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Identity Fields */}
            {itemType === "identity" && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="identity-name">
                    {t("vault.fullName", "Full Name")}
                  </Label>
                  <Input
                    id="identity-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="identity-email">
                    {t("vault.email", "Email")}
                  </Label>
                  <Input
                    id="identity-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="identity-phone">
                    {t("vault.phone", "Phone")}
                  </Label>
                  <Input
                    id="identity-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </>
            )}

            {/* TOTP Fields */}
            {itemType === "totp" && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="totp-issuer">
                    {t("vault.issuer", "Issuer")}
                  </Label>
                  <Input
                    id="totp-issuer"
                    value={totpIssuer}
                    onChange={(e) => setTotpIssuer(e.target.value)}
                    placeholder={t(
                      "vault.issuerPlaceholder",
                      "e.g. GitHub, Google",
                    )}
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="totp-account">
                    {t("vault.account", "Account")}
                  </Label>
                  <Input
                    id="totp-account"
                    value={totpAccount}
                    onChange={(e) => setTotpAccount(e.target.value)}
                    placeholder={t(
                      "vault.accountPlaceholder",
                      "user@example.com",
                    )}
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="totp-secret">
                    {t("vault.totpSecret", "Secret Key")}
                  </Label>
                  <Input
                    ref={totpSecretRef}
                    id="totp-secret"
                    type="password"
                    onChange={(event) =>
                      setHasTotpSecret(
                        Boolean(event.currentTarget.value.trim()),
                      )
                    }
                    placeholder="JBSWY3DPEHPK3PXP"
                    autoComplete="off"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "vault.totpSecretHint",
                      "Base32-encoded secret from your provider",
                    )}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="totp-algorithm">
                      {t("vault.algorithm", "Algorithm")}
                    </Label>
                    <Select
                      value={totpAlgorithm}
                      onValueChange={setTotpAlgorithm}
                    >
                      <SelectTrigger id="totp-algorithm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SHA1">SHA-1</SelectItem>
                        <SelectItem value="SHA256">SHA-256</SelectItem>
                        <SelectItem value="SHA512">SHA-512</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="totp-digits">
                      {t("vault.digits", "Digits")}
                    </Label>
                    <Select value={totpDigits} onValueChange={setTotpDigits}>
                      <SelectTrigger id="totp-digits">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">6</SelectItem>
                        <SelectItem value="8">8</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="totp-period">
                      {t("vault.period", "Period")}
                    </Label>
                    <Input
                      id="totp-period"
                      type="number"
                      value={totpPeriod}
                      onChange={(e) => setTotpPeriod(e.target.value)}
                      min={10}
                      max={120}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Passkey hint */}
            {itemType === "passkey" && (
              <p className="text-sm text-muted-foreground">
                {t(
                  "vault.passkeyHint",
                  "Passkeys are registered via WebAuthn. Use Security settings to add a passkey — credential data will be stored encrypted.",
                )}
              </p>
            )}

            {/* Notes (login, identity, note, and fallback types) */}
            {["login", "identity", "note", "passkey", "totp", "file"].includes(
              itemType,
            ) && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="item-notes">
                  {itemType === "note"
                    ? t("vault.content", "Content")
                    : t("vault.notes", "Notes")}
                </Label>
                <Textarea
                  id="item-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
            >
              {t("common:cancel", "Cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                !title.trim() ||
                (itemType === "totp" && !hasTotpSecret)
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  {t("vault.encrypting", "Encrypting...")}
                </>
              ) : (
                t("vault.save", "Save")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingSubmission !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !isSubmitting) setPendingSubmission(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingSubmission?.duplicateCount === null
                ? t(
                    "vault.duplicateCheckFailedTitle",
                    "Couldn’t check the whole vault",
                  )
                : t("vault.duplicateFoundTitle", "Duplicate item found")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSubmission?.duplicateCount === null
                ? t(
                    "vault.duplicateCheckFailedDescription",
                    "The item list could not be checked completely. You can review the item or add it without a duplicate check.",
                  )
                : t(
                    "vault.duplicateFoundDescription",
                    "An identical item already exists in this vault. Review this item or add it anyway.",
                    { count: pendingSubmission?.duplicateCount ?? 1 },
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              {t("vault.reviewItem", "Review item")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleAddAnyway();
              }}
              disabled={isSubmitting}
              data-testid="duplicate-add-anyway"
            >
              {isSubmitting
                ? t("vault.encrypting", "Encrypting...")
                : t("vault.addAnyway", "Add anyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
