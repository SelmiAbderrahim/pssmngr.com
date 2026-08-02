// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Profile Form Component
 *
 * Main profile editing form with:
 * - First and Last name editing
 * - Email display (read-only)
 * - Profile picture upload
 *
 * @module components/dashboard/settings/profile/ProfileForm
 */

import * as React from "react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { User, Loader2, Upload, CheckCircle2, AlertCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";


/**
 * Form validation schema factory (localized messages)
 */
const makeProfileSchema = (t: TFunction) =>
  z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email(t("errors:validation.invalidEmail", "Please enter a valid email address")),
    image: z.string().optional(),
  });

type ProfileFormData = z.infer<ReturnType<typeof makeProfileSchema>>;

/**
 * User profile data structure
 */
export interface UserProfileData {
  /** User's email */
  email: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** Avatar/profile image URL */
  image?: string;
  /** Whether email is verified */
  emailVerified?: boolean;
}

/**
 * Props for ProfileForm component
 */
export interface ProfileFormProps {
  /** Current user profile data */
  profile: UserProfileData;
  /** Callback when profile is updated */
  onUpdate?: (data: Partial<UserProfileData>) => Promise<void>;
  /** Callback to send verification email */
  onSendVerification?: () => Promise<void>;
  /** Whether component is in loading state */
  isLoading?: boolean;
  /** Optional className for styling */
  className?: string;
}

/**
 * ProfileForm - User profile editing form
 *
 * @example
 * ```tsx
 * <ProfileForm
 *   profile={user}
 *   onUpdate={async (data) => await updateProfile(data)}
 * />
 * ```
 */
export function ProfileForm({
  profile,
  onUpdate,
  onSendVerification,
  isLoading: externalLoading = false,
  className,
}: ProfileFormProps): React.JSX.Element {
  const { t } = useTranslation(["settings", "errors"]);
  const profileSchema = React.useMemo(() => makeProfileSchema(t), [t]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  /**
   * Handle sending verification email
   */
  const handleSendVerification = async () => {
    if (!onSendVerification) return;

    setIsSendingVerification(true);
    try {
      await onSendVerification();
      toast.success(t("profile.verificationSent", "Verification email sent"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("profile.verificationFailed", "Failed to send verification email")
      );
    } finally {
      setIsSendingVerification(false);
    }
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      email: profile.email,
      image: profile.image || "",
    },
  });

  const selectedImage = watch("image");

  // Reset form when profile changes
  useEffect(() => {
    reset({
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      email: profile.email,
      image: profile.image || "",
    });
  }, [profile, reset]);

  /**
   * Handle form submission
   */
  const onSubmit = async (data: ProfileFormData) => {
    if (!onUpdate) return;

    setIsUpdating(true);
    try {
      await onUpdate({
        firstName: data.firstName,
        lastName: data.lastName,
        image: data.image,
      });
      toast.success(t("profile.updateSuccess", "Profile updated successfully"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("profile.updateError", "Failed to update profile")
      );
    } finally {
      setIsUpdating(false);
    }
  };

  /**
   * Handle custom image upload
   */
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("profile.imageSizeError", "Image size must be less than 2MB"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setValue("image", result, { shouldDirty: true });
    };
    reader.readAsDataURL(file);
  };

  const isLoading = externalLoading || isUpdating;

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          {t("profile.title", "Profile")}
        </CardTitle>
        <CardDescription>
          {t("profile.description", "Manage your profile information")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {externalLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Name Fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t("profile.firstName", "First Name")}</Label>
                <Input
                  id="firstName"
                  placeholder={t("profile.firstNamePlaceholder", "John")}
                  disabled={isLoading}
                  className="min-h-[44px]"
                  {...register("firstName")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t("profile.lastName", "Last Name")}</Label>
                <Input
                  id="lastName"
                  placeholder={t("profile.lastNamePlaceholder", "Doe")}
                  disabled={isLoading}
                  className="min-h-[44px]"
                  {...register("lastName")}
                />
              </div>
            </div>

            {/* Email (read-only) with verification status */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="email">{t("profile.email", "Email")}</Label>
                {/* Email verification badge */}
                {profile.emailVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    {t("profile.emailVerified", "Verified")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    <AlertCircle className="h-3 w-3" aria-hidden="true" />
                    {t("profile.emailUnverified", "Unverified")}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  disabled
                  className="min-h-[44px] bg-muted flex-1"
                  {...register("email")}
                />
                {/* Send verification button (only show if not verified) */}
                {!profile.emailVerified && onSendVerification && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendVerification}
                    disabled={isSendingVerification || isLoading}
                    className="min-h-[44px] whitespace-nowrap"
                  >
                    {isSendingVerification ? (
                      <>
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                        {t("profile.sendingVerification", "Sending...")}
                      </>
                    ) : (
                      <>
                        <Send className="me-2 h-4 w-4" />
                        {t("profile.sendVerification", "Send Verification Email")}
                      </>
                    )}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("profile.emailReadonly", "Email cannot be changed")}
              </p>
            </div>

            {/* Profile Picture Upload */}
            <div className="space-y-3">
              <Label>{t("profile.profilePicture", "Profile Picture")}</Label>
              <div className="flex items-center gap-4">
                {/* Avatar Preview */}
                <Avatar className="h-24 w-24 border-2 border-border">
                  {selectedImage && <AvatarImage src={selectedImage} alt="Profile" />}
                  <AvatarFallback className="bg-muted">
                    <User className="h-10 w-10 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>

                {/* Upload/Remove Actions */}
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px]"
                    onClick={() => document.getElementById("avatar-upload")?.click()}
                    disabled={isLoading}
                  >
                    <Upload className="me-2 h-4 w-4" />
                    {selectedImage
                      ? t("profile.changePhoto", "Change Photo")
                      : t("profile.uploadPhoto", "Upload Photo")}
                  </Button>
                  {selectedImage && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-[44px] text-destructive hover:text-destructive"
                      onClick={() => setValue("image", "", { shouldDirty: true })}
                      disabled={isLoading}
                    >
                      {t("profile.removePhoto", "Remove Photo")}
                    </Button>
                  )}
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("profile.photoRequirements", "JPG, PNG, GIF or WebP. Max 2MB.")}
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={isLoading || !isDirty}
                className="min-h-[44px]"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t("common.saving", "Saving...")}
                  </>
                ) : (
                  t("common.save", "Save Changes")
                )}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default ProfileForm;
