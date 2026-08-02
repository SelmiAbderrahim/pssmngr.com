// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Item Detail View
 *
 * Displays a single vault item with view/edit modes, password masking,
 * clipboard handling with auto-clear, and type-specific field layouts.
 * All data is decrypted client-side — never sent as plaintext to server.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { openExternalUrlSafe } from "@/lib/safe-external-url";
import { copySensitiveText } from "@/lib/clipboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import {
  Key,
  CreditCard,
  StickyNote,
  User,
  Fingerprint,
  ShieldCheck,
  File,
  Eye,
  EyeOff,
  Copy,
  Check,
  ExternalLink,
  Star,
  Pencil,
  Trash2,
  X,
  Loader2,
  ArrowLeft,
  Clock,
  Share2,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDateTimeLocalized } from "@/lib/date-locale";
import type {
  DecryptedVaultItem,
  ItemType,
  TOTPItemData,
  PasskeyItemData,
} from "./VaultItemCard";
import {
  generateTOTP,
  base32Decode,
  getRemainingSeconds,
  type TOTPConfig,
} from "@/services/totp-engine";

// ── Types ────────────────────────────────────────────────────────────

interface ItemDetailViewProps {
  item: DecryptedVaultItem;
  onClose: () => void;
  onSave: (itemId: string, data: Record<string, unknown>) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
  onToggleFavorite: (itemId: string) => void;
  onShareClick?: (itemId: string) => void;
  onEphemeralShareClick?: (itemId: string) => void;
  isFavoriteLoading?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  showFavorite?: boolean;
}

// ── Constants ────────────────────────────────────────────────────────

const PASSWORD_AUTO_HIDE_MS = 30_000;
const SENSITIVE_EDIT_KEYS = new Set(["password", "number", "cvv", "secret"]);

const ITEM_ICONS: Record<ItemType, React.ElementType> = {
  login: Key,
  passkey: Fingerprint,
  identity: User,
  card: CreditCard,
  note: StickyNote,
  totp: ShieldCheck,
  file: File,
};

const ITEM_TYPE_COLORS: Record<ItemType, string> = {
  login: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
  passkey:
    "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300",
  identity:
    "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  card: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  note: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300",
  totp: "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300",
  file: "bg-slate-50 text-slate-700 dark:bg-slate-900/20 dark:text-slate-300",
};

const ITEM_TYPE_TRANSLATION_KEYS: Record<ItemType, string> = {
  login: "login",
  passkey: "passkey",
  identity: "identity",
  card: "card",
  note: "secureNote",
  totp: "totp",
  file: "file",
};

// ── Helpers ──────────────────────────────────────────────────────────

function getTitle(d: Record<string, unknown>, fallback: string): string {
  return (d.title as string) || (d.name as string) || fallback;
}

function maskCardNumber(num: string): string {
  if (num.length <= 4) return num;
  return "\u2022".repeat(num.length - 4) + " " + num.slice(-4);
}

function createEditData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !SENSITIVE_EDIT_KEYS.has(key)),
  );
}

// ── TOTP Code Display ────────────────────────────────────────────────

function formatTOTPCode(code: string): string {
  if (code.length <= 3) return code;
  const mid = Math.ceil(code.length / 2);
  return code.slice(0, mid) + "\u2009" + code.slice(mid);
}

function TOTPCodeDisplay({
  data,
  copyToClipboard,
  copiedField,
}: {
  data: TOTPItemData;
  copyToClipboard: (value: string, field: string) => Promise<void>;
  copiedField: string | null;
}) {
  const { t } = useTranslation(["common", "vault"]);
  const [code, setCode] = useState("");
  const [remaining, setRemaining] = useState(0);
  const period = data.period || 30;

  useEffect(() => {
    if (!data.secret) return;

    let mounted = true;

    async function generate() {
      try {
        const secret = base32Decode(data.secret);
        const config: Partial<TOTPConfig> & Pick<TOTPConfig, "secret"> = {
          secret,
          algorithm: (data.algorithm as TOTPConfig["algorithm"]) || "SHA1",
          digits: (data.digits as TOTPConfig["digits"]) || 6,
          period,
        };
        const result = await generateTOTP(config);
        if (mounted) setCode(result);
      } catch {
        if (mounted) setCode("");
      }
    }

    generate();
    setRemaining(getRemainingSeconds(period));

    const interval = setInterval(() => {
      const r = getRemainingSeconds(period);
      setRemaining(r);
      if (r === period || r === period - 1) generate();
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [data.secret, data.algorithm, data.digits, period]);

  if (!data.secret) return null;

  const label = t("vault.totpCode", "TOTP Code");
  const urgency = remaining <= 5;

  // Circular countdown SVG
  const size = 32;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - remaining / period);

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-3 min-h-[36px]">
        {/* Circular countdown */}
        <div
          className="relative flex items-center justify-center shrink-0"
          style={{ width: size, height: size }}
        >
          <svg
            width={size}
            height={size}
            className="-rotate-90"
            aria-hidden="true"
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-muted"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className={urgency ? "text-destructive" : "text-primary"}
            />
          </svg>
          <span
            className={cn(
              "absolute text-[10px] font-mono tabular-nums",
              urgency ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {remaining}
          </span>
        </div>

        <span
          className="text-2xl font-mono tracking-widest flex-1"
          aria-live="polite"
        >
          {code ? formatTOTPCode(code) : t("vault:placeholderCode", "--- ---")}
        </span>

        {code && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={() => copyToClipboard(code, label)}
            aria-label={t("vault.copy", "Copy {{field}}", { field: label })}
          >
            {copiedField === label ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────

export function ItemDetailView({
  item,
  onClose,
  onSave,
  onDelete,
  onToggleFavorite,
  onShareClick,
  onEphemeralShareClick,
  isFavoriteLoading,
  canEdit = true,
  canDelete = true,
  showFavorite = true,
}: ItemDetailViewProps) {
  const { t } = useTranslation(["common", "vault"]);
  const d = item.decrypted;

  // ── Edit state ───────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const pendingCloseRef = useRef(false);

  // ── Visibility state ─────────────────────────────────────────────
  const [showPassword, setShowPassword] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const [showCardNumber, setShowCardNumber] = useState(false);
  const passwordTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const cvvTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const cardTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Clipboard state ──────────────────────────────────────────────
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copiedIndicatorRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Delete state ─────────────────────────────────────────────────
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Auto-hide passwords after timeout ────────────────────────────
  useEffect(() => {
    if (showPassword) {
      passwordTimerRef.current = setTimeout(
        () => setShowPassword(false),
        PASSWORD_AUTO_HIDE_MS,
      );
    }
    return () => clearTimeout(passwordTimerRef.current);
  }, [showPassword]);

  useEffect(() => {
    if (showCvv) {
      cvvTimerRef.current = setTimeout(
        () => setShowCvv(false),
        PASSWORD_AUTO_HIDE_MS,
      );
    }
    return () => clearTimeout(cvvTimerRef.current);
  }, [showCvv]);

  useEffect(() => {
    if (showCardNumber) {
      cardTimerRef.current = setTimeout(
        () => setShowCardNumber(false),
        PASSWORD_AUTO_HIDE_MS,
      );
    }
    return () => clearTimeout(cardTimerRef.current);
  }, [showCardNumber]);

  // Cleanup timers on unmount
  // SECURITY (Round 4, fix #31): the 30s clipboard auto-wipe lives in
  // @/lib/clipboard (module-level timer) so it survives unmount; only
  // the cosmetic "Copied!" indicator timer is cleared here.
  useEffect(() => {
    return () => {
      clearTimeout(copiedIndicatorRef.current);
    };
  }, []);

  // ── Clipboard handling ───────────────────────────────────────────

  const copyToClipboard = useCallback(
    async (value: string, fieldName: string) => {
      try {
        // Copies and schedules the 30s clipboard auto-wipe (survives unmount)
        await copySensitiveText(value);
        setCopiedField(fieldName);

        // Clear copied indicator after 2s
        clearTimeout(copiedIndicatorRef.current);
        copiedIndicatorRef.current = setTimeout(
          () => setCopiedField(null),
          2000,
        );

        toast.success(
          t("vault.copied", "Copied {{field}} to clipboard", {
            field: fieldName,
          }),
          { duration: 2000 },
        );
      } catch {
        toast.error(t("vault.copyFailed", "Failed to copy to clipboard"));
      }
    },
    [t],
  );

  // ── Edit handlers ────────────────────────────────────────────────

  const startEditing = useCallback(() => {
    setEditData(createEditData(d));
    setIsEditing(true);
    setHasUnsavedChanges(false);
  }, [d]);

  const updateField = useCallback((key: string, value: unknown) => {
    setEditData((prev) => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
  }, []);

  const cancelEditing = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowDiscardDialog(true);
      pendingCloseRef.current = false;
    } else {
      setIsEditing(false);
      setEditData({});
    }
  }, [hasUnsavedChanges]);

  const confirmDiscard = useCallback(() => {
    setIsEditing(false);
    setEditData({});
    setHasUnsavedChanges(false);
    setShowDiscardDialog(false);
    if (pendingCloseRef.current) {
      pendingCloseRef.current = false;
      onClose();
    }
  }, [onClose]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave(item.id, { ...d, ...editData });
      setIsEditing(false);
      setEditData({});
      setHasUnsavedChanges(false);
      toast.success(t("vault.saved", "Item saved"));
    } catch {
      toast.error(t("vault.saveFailed", "Failed to save changes"));
    } finally {
      setIsSaving(false);
    }
  }, [item.id, d, editData, onSave, t]);

  const handleClose = useCallback(() => {
    if (isEditing && hasUnsavedChanges) {
      pendingCloseRef.current = true;
      setShowDiscardDialog(true);
    } else {
      onClose();
    }
  }, [isEditing, hasUnsavedChanges, onClose]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete(item.id);
      toast.success(t("vault.deleted", "Item moved to trash"));
      onClose();
    } catch {
      toast.error(t("vault.deleteFailed", "Failed to delete item"));
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }, [item.id, onDelete, onClose, t]);

  // ── Field value getter (edit or view) ────────────────────────────

  const fieldValue = useCallback(
    (key: string): string => {
      if (isEditing) return String(editData[key] ?? "");
      return String(d[key] ?? "");
    },
    [isEditing, editData, d],
  );

  // ── Shared field renderers ───────────────────────────────────────

  const Icon = ITEM_ICONS[item.itemType] || Key;
  const colorClass = ITEM_TYPE_COLORS[item.itemType] || ITEM_TYPE_COLORS.login;
  const title = isEditing
    ? String(editData.title ?? editData.name ?? "")
    : getTitle(d, t("vault:untitled", "Untitled"));

  function renderTextField(
    label: string,
    key: string,
    opts?: { type?: string; copyable?: boolean; multiline?: boolean },
  ) {
    const value = fieldValue(key);
    const inputId = `item-detail-${key}`;
    const { type = "text", copyable = true, multiline = false } = opts ?? {};

    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId} className="text-xs text-muted-foreground">
          {label}
        </Label>
        {isEditing ? (
          multiline ? (
            <Textarea
              id={inputId}
              value={value}
              onChange={(e) => updateField(key, e.target.value)}
              rows={4}
              className="resize-none"
            />
          ) : (
            <Input
              id={inputId}
              type={type}
              value={value}
              onChange={(e) => updateField(key, e.target.value)}
              autoComplete="off"
            />
          )
        ) : (
          <div className="flex items-center gap-2 min-h-[36px]">
            <span className="text-sm flex-1 break-all">
              {value || <span className="text-muted-foreground italic">—</span>}
            </span>
            {copyable && value && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => copyToClipboard(value, label)}
                aria-label={t("vault.copy", "Copy {{field}}", { field: label })}
              >
                {copiedField === label ? (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderPasswordField(label: string, key: string) {
    const value = fieldValue(key);
    const inputId = `item-detail-${key}`;
    const isVisible = showPassword;
    const hasPreservedValue =
      isEditing && editData[key] === undefined && Boolean(d[key]);

    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId} className="text-xs text-muted-foreground">
          {label}
        </Label>
        {isEditing ? (
          <div className="relative">
            <Input
              id={inputId}
              type={isVisible ? "text" : "password"}
              value={value}
              onChange={(e) => updateField(key, e.target.value)}
              placeholder={
                hasPreservedValue
                  ? t(
                      "vault.sensitiveFieldUnchanged",
                      "Leave blank to keep existing value",
                    )
                  : undefined
              }
              autoComplete="new-password"
              className="pe-20"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute end-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowPassword(!isVisible)}
              tabIndex={-1}
              aria-label={
                isVisible
                  ? t("vault.hidePassword", "Hide password")
                  : t("vault.showPassword", "Show password")
              }
            >
              {isVisible ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-h-[36px]">
            <span
              className="text-sm flex-1 font-mono break-all"
              aria-live="polite"
              aria-label={
                isVisible
                  ? t("vault.passwordShown", "Password shown")
                  : t("vault.passwordHidden", "Password hidden")
              }
            >
              {value ? (
                isVisible ? (
                  value
                ) : (
                  "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                )
              ) : (
                <span className="text-muted-foreground italic">—</span>
              )}
            </span>
            {value && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setShowPassword(!isVisible)}
                  aria-label={
                    isVisible
                      ? t("vault.hidePassword", "Hide password")
                      : t("vault.showPassword", "Show password")
                  }
                >
                  {isVisible ? (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => copyToClipboard(value, label)}
                  aria-label={t("vault.copy", "Copy {{field}}", {
                    field: label,
                  })}
                >
                  {copiedField === label ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderMaskedField(
    label: string,
    key: string,
    visible: boolean,
    setVisible: (v: boolean) => void,
    maskFn?: (v: string) => string,
  ) {
    const value = fieldValue(key);
    const inputId = `item-detail-${key}`;
    const masked = maskFn
      ? maskFn(value)
      : "\u2022".repeat(Math.max(value.length, 3));
    const hasPreservedValue =
      isEditing && editData[key] === undefined && Boolean(d[key]);

    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId} className="text-xs text-muted-foreground">
          {label}
        </Label>
        {isEditing ? (
          <Input
            id={inputId}
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => updateField(key, e.target.value)}
            placeholder={
              hasPreservedValue
                ? t(
                    "vault.sensitiveFieldUnchanged",
                    "Leave blank to keep existing value",
                  )
                : undefined
            }
            autoComplete="off"
          />
        ) : (
          <div className="flex items-center gap-2 min-h-[36px]">
            <span className="text-sm flex-1 font-mono break-all">
              {value ? (
                visible ? (
                  value
                ) : (
                  masked
                )
              ) : (
                <span className="text-muted-foreground italic">—</span>
              )}
            </span>
            {value && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setVisible(!visible)}
                  aria-label={
                    visible ? t("vault.hide", "Hide") : t("vault.show", "Show")
                  }
                >
                  {visible ? (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => copyToClipboard(value, label)}
                  aria-label={t("vault.copy", "Copy {{field}}", {
                    field: label,
                  })}
                >
                  {copiedField === label ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderUrlField(label: string, key: string) {
    const value = fieldValue(key);
    const inputId = `item-detail-${key}`;

    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId} className="text-xs text-muted-foreground">
          {label}
        </Label>
        {isEditing ? (
          <Input
            id={inputId}
            type="url"
            value={value}
            onChange={(e) => updateField(key, e.target.value)}
            placeholder="https://example.com"
            autoComplete="off"
          />
        ) : (
          <div className="flex items-center gap-2 min-h-[36px]">
            <span className="text-sm flex-1 break-all text-primary">
              {value || <span className="text-muted-foreground italic">—</span>}
            </span>
            {value && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => void openExternalUrlSafe(value)}
                  aria-label={t("vault.openUrl", "Open URL")}
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => copyToClipboard(value, label)}
                  aria-label={t("vault.copy", "Copy {{field}}", {
                    field: label,
                  })}
                >
                  {copiedField === label ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Type-specific field sections ─────────────────────────────────

  function renderLoginFields() {
    return (
      <>
        {renderTextField(t("vault.username", "Username"), "username")}
        {renderPasswordField(t("vault.password", "Password"), "password")}
        {renderUrlField(t("vault.url", "URL"), "url")}
        {d.totpSeed && !isEditing && (
          <TOTPCodeDisplay
            data={{
              issuer: "",
              account: "",
              secret: d.totpSeed as string,
              algorithm: "SHA1",
              digits: 6,
              period: 30,
            }}
            copyToClipboard={copyToClipboard}
            copiedField={copiedField}
          />
        )}
        {renderTextField(t("vault.notes", "Notes"), "notes", {
          copyable: false,
          multiline: true,
        })}
      </>
    );
  }

  function renderCardFields() {
    return (
      <>
        {renderTextField(t("vault.cardholderName", "Cardholder Name"), "name")}
        {renderMaskedField(
          t("vault.cardNumber", "Card Number"),
          "number",
          showCardNumber,
          setShowCardNumber,
          maskCardNumber,
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>{renderTextField(t("vault.expiry", "Expiry"), "expiry")}</div>
          <div>
            {renderMaskedField(
              t("vault.cvv", "CVV"),
              "cvv",
              showCvv,
              setShowCvv,
            )}
          </div>
        </div>
        {renderTextField(t("vault.notes", "Notes"), "notes", {
          copyable: false,
          multiline: true,
        })}
      </>
    );
  }

  function renderIdentityFields() {
    return (
      <>
        {renderTextField(t("vault.fullName", "Full Name"), "fullName")}
        {renderTextField(t("vault.email", "Email"), "email", { type: "email" })}
        {renderTextField(t("vault.phone", "Phone"), "phone", { type: "tel" })}
        {renderTextField(t("vault.notes", "Notes"), "notes", {
          copyable: false,
          multiline: true,
        })}
      </>
    );
  }

  function renderNoteFields() {
    return (
      <>
        {renderTextField(t("vault.content", "Content"), "content", {
          copyable: true,
          multiline: true,
        })}
      </>
    );
  }

  function renderTotpFields() {
    return (
      <>
        {renderTextField(t("vault.issuer", "Issuer"), "issuer")}
        {renderTextField(t("vault.account", "Account"), "account")}
        {!isEditing && (
          <TOTPCodeDisplay
            data={d as unknown as TOTPItemData}
            copyToClipboard={copyToClipboard}
            copiedField={copiedField}
          />
        )}
        {isEditing && (
          <>
            {renderPasswordField(t("vault.totpSecret", "Secret Key"), "secret")}
            {renderTextField(t("vault.algorithm", "Algorithm"), "algorithm")}
            {renderTextField(t("vault.digits", "Digits"), "digits")}
            {renderTextField(t("vault.period", "Period"), "period")}
          </>
        )}
        {renderTextField(t("vault.notes", "Notes"), "notes", {
          copyable: false,
          multiline: true,
        })}
      </>
    );
  }

  function renderPasskeyFields() {
    const pk = d as unknown as PasskeyItemData;
    const transports = Array.isArray(pk.transports)
      ? pk.transports.join(", ")
      : "";

    return (
      <>
        {renderTextField(t("vault.rpId", "Relying Party"), "rpId")}
        {renderTextField(
          t("vault.credentialId", "Credential ID"),
          "credentialId",
        )}
        {renderTextField(t("vault.userHandle", "User Handle"), "userHandle")}
        {renderTextField(t("vault.publicKey", "Public Key"), "publicKey")}
        {!isEditing && transports && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("vault.transports", "Transports")}
            </Label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(pk.transports || []).map((transport) => (
                <Badge key={transport} variant="outline" className="text-xs">
                  {transport}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {pk.createdAt && !isEditing && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("vault.registeredAt", "Registered")}
            </Label>
            <span className="text-sm">
              {formatDateTimeLocalized(pk.createdAt)}
            </span>
          </div>
        )}
        {renderTextField(t("vault.notes", "Notes"), "notes", {
          copyable: false,
          multiline: true,
        })}
      </>
    );
  }

  function renderDefaultFields() {
    return (
      <>
        {renderTextField(t("vault.notes", "Notes"), "notes", {
          copyable: false,
          multiline: true,
        })}
      </>
    );
  }

  function renderTypeFields() {
    switch (item.itemType) {
      case "login":
        return renderLoginFields();
      case "card":
        return renderCardFields();
      case "identity":
        return renderIdentityFields();
      case "note":
        return renderNoteFields();
      case "totp":
        return renderTotpFields();
      case "passkey":
        return renderPasskeyFields();
      default:
        return renderDefaultFields();
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleClose}
          aria-label={t("vault.back", "Back to vault")}
        >
          <ArrowLeft className="h-4 w-4 rtl:scale-x-[-1]" />
        </Button>

        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            colorClass,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <Input
              id="item-detail-title"
              aria-label={t("vault:itemTitle", "Title")}
              value={String(editData.title ?? editData.name ?? "")}
              onChange={(e) =>
                updateField(
                  d.name !== undefined ? "name" : "title",
                  e.target.value,
                )
              }
              className="text-lg font-semibold h-8 px-1"
              autoFocus
            />
          ) : (
            <h2 className="text-lg font-semibold truncate">{title}</h2>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-xs">
              {t(
                `vault:itemTypes.${ITEM_TYPE_TRANSLATION_KEYS[item.itemType] || item.itemType}`,
                item.itemType,
              )}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {showFavorite && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onToggleFavorite(item.id)}
              disabled={isFavoriteLoading}
              aria-label={
                item.isFavorite
                  ? t("vault.unfavorite", "Remove from favorites")
                  : t("vault.favorite", "Add to favorites")
              }
            >
              {isFavoriteLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Star
                  className={cn(
                    "h-4 w-4",
                    item.isFavorite
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground",
                  )}
                />
              )}
            </Button>
          )}

          {!isEditing && (
            <>
              {onShareClick && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => onShareClick(item.id)}
                  aria-label={t("sharing.share", "Share")}
                  data-tour="vault-share"
                >
                  <Share2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
              {onEphemeralShareClick && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => onEphemeralShareClick(item.id)}
                  aria-label={t("ephemeral.createLink", "Create Link")}
                >
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={startEditing}
                  aria-label={t("vault.edit", "Edit item")}
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setShowDeleteDialog(true)}
                  aria-label={t("vault.delete", "Delete item")}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4 max-w-lg">
          {renderTypeFields()}

          {/* Timestamps */}
          {!isEditing && (
            <>
              <Separator className="my-2" />
              <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  <span>
                    {t("vault.created", "Created")}:{" "}
                    {formatDateTimeLocalized(item.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  <span>
                    {t("vault.modified", "Modified")}:{" "}
                    {formatDateTimeLocalized(item.updatedAt)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Edit mode footer */}
      {isEditing && (
        <div className="flex items-center justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={cancelEditing} disabled={isSaving}>
            <X className="h-4 w-4 me-1" />
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 me-1 animate-spin" />
                {t("vault.saving", "Saving...")}
              </>
            ) : (
              t("vault.save", "Save")
            )}
          </Button>
        </div>
      )}

      {/* Discard changes dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("vault.unsavedChanges", "Unsaved Changes")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "vault.unsavedChangesDescription",
                "You have unsaved changes. Are you sure you want to discard them?",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("vault.keepEditing", "Keep editing")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              {t("vault.discard", "Discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("vault.deleteItem", "Delete Item")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "vault.deleteItemDescription",
                "This item will be moved to trash. You can restore it later.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 me-1 animate-spin" />
                  {t("vault.deleting", "Deleting...")}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 me-1" />
                  {t("vault.delete", "Delete")}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
