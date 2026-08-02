// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UserPlus, Trash2, Loader2, ShieldCheck, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { TrustedContact } from "@/types/emergency";

interface TrustedContactListProps {
  contacts: TrustedContact[];
  isLoading: boolean;
  onAddClick: () => void;
  onRemove: (contactId: string) => Promise<void>;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return (email[0] ?? "?").toUpperCase();
}


export function TrustedContactList({
  contacts,
  isLoading,
  onAddClick,
  onRemove,
}: TrustedContactListProps) {
  const { t } = useTranslation(["emergency", "common"]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  async function handleConfirmRemove() {
    if (!confirmRemoveId) return;
    setRemovingId(confirmRemoveId);
    try {
      await onRemove(confirmRemoveId);
    } finally {
      setRemovingId(null);
      setConfirmRemoveId(null);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const contactToRemove = contacts.find((c) => c.id === confirmRemoveId);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                {t("contacts.title", "Trusted Contacts")}
              </CardTitle>
              <CardDescription className="mt-1">
                {t(
                  "emergency.contacts.description",
                  "People who can request emergency access to your vault."
                )}
              </CardDescription>
            </div>
            <Button size="sm" onClick={onAddClick}>
              <UserPlus className="h-4 w-4 me-1" />
              {t("contacts.add", "Add Contact")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <div className="text-center py-8">
              <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-1">
                {t("contacts.empty", "No trusted contacts yet.")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "emergency.contacts.emptyHint",
                  "Add someone you trust to enable emergency access to your vault."
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {contacts.map((tc) => (
                <div
                  key={tc.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={tc.contact.image ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {getInitials(tc.contact.name, tc.contact.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {tc.contact.name || tc.contact.email}
                      </p>
                      {tc.contact.name && (
                        <p className="text-xs text-muted-foreground truncate">
                          {tc.contact.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {t("contacts.waitDays", "{{count}}d wait", {
                        count: tc.waitingPeriodDays,
                      })}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemoveId(tc.id)}
                      disabled={removingId === tc.id}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      {removingId === tc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!confirmRemoveId}
        onOpenChange={() => setConfirmRemoveId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("contacts.removeTitle", "Remove Trusted Contact")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "emergency.contacts.removeDescription",
                "Remove {{name}} as a trusted contact? Any pending emergency access requests from them will be cancelled.",
                {
                  name:
                    contactToRemove?.contact.name ||
                    contactToRemove?.contact.email ||
                    "",
                }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("common:actions.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removingId && (
                <Loader2 className="h-4 w-4 me-1 animate-spin" />
              )}
              {t("contacts.confirmRemove", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
