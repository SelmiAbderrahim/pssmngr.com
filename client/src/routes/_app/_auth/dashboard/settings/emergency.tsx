// Copyright (c) 2026 Password Manager contributors
import { useState, useEffect, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Users, Clock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpcQuery, trpcMutation } from "@/lib/api/trpc";
import { TrustedContactList } from "@/components/emergency/TrustedContactList";
import { AddContactDialog } from "@/components/emergency/AddContactDialog";
import { RequestBanner } from "@/components/emergency/RequestBanner";
import { RequestTimeline } from "@/components/emergency/RequestTimeline";
import { useSensitiveActionVerify } from "@/components/vault/SensitiveActionGate";
import type { TrustedContact, EmergencyAccessRequest } from "@/types/emergency";

type TabState = "contacts" | "incoming" | "outgoing";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/settings/emergency"
)({
  component: EmergencySettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as TabState) || "contacts",
  }),
});

function EmergencySettingsPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { tab } = Route.useSearch();

  // Data state
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<EmergencyAccessRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<EmergencyAccessRequest[]>([]);

  // UI state
  const [isLoadingContacts, setIsLoadingContacts] = useState(true);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Sensitive-action gate: emergency-access setup + granting a request both
  // demand a fresh master password even when the vault is silently unlocked.
  const [verifyEmergency, verifyEmergencyDialog] =
    useSensitiveActionVerify("emergencyAccess");

  // Tab navigation
  const handleTabChange = useCallback(
    (newTab: string) => {
      navigate({
        to: "/dashboard/settings/emergency",
        search: { tab: newTab as TabState },
        replace: true,
      });
    },
    [navigate]
  );

  // Fetch trusted contacts
  const fetchContacts = useCallback(async () => {
    setIsLoadingContacts(true);
    try {
      const data = await trpcQuery<TrustedContact[]>(
        "emergency",
        "listTrustedContacts"
      );
      setContacts(data);
    } catch {
      // Non-critical, will show empty list
    } finally {
      setIsLoadingContacts(false);
    }
  }, []);

  // Fetch all requests (incoming as owner, outgoing as contact)
  const fetchRequests = useCallback(async () => {
    setIsLoadingRequests(true);
    try {
      const data = await trpcQuery<EmergencyAccessRequest[]>(
        "emergency",
        "listRequests"
      );
      // Split by role: if current user is the owner → incoming, else → outgoing
      // The server returns requests for both roles; we need the current user ID
      const me = await trpcQuery<{ id: string }>("user", "get");
      setIncomingRequests(data.filter((r) => r.owner.id === me.id));
      setOutgoingRequests(data.filter((r) => r.contact.id === me.id));
    } catch {
      // Non-critical
    } finally {
      setIsLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
    fetchRequests();
  }, [fetchContacts, fetchRequests]);

  // Actions
  async function handleAddContact(email: string, waitingPeriodDays: number) {
    await trpcMutation("emergency", "addTrustedContact", {
      contactEmail: email,
      waitingPeriodDays,
    });
    fetchContacts();
  }

  async function handleRemoveContact(contactId: string) {
    await trpcMutation("emergency", "removeTrustedContact", {
      trustedContactId: contactId,
    });
    fetchContacts();
  }

  async function handleDenyRequest(requestId: string) {
    await trpcMutation("emergency", "denyRequest", { requestId });
    fetchRequests();
  }

  async function handleRequestAccess(ownerId: string) {
    if (!(await verifyEmergency())) return;
    await trpcMutation("emergency", "requestAccess", { ownerId });
    fetchRequests();
  }

  const pendingIncoming = incomingRequests.filter(
    (r) => r.status === "pending"
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">
          {t("emergency.title", "Emergency Access")}
        </h2>
        <p className="text-muted-foreground mt-1">
          {t(
            "emergency.subtitle",
            "Manage trusted contacts and emergency access requests."
          )}
        </p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="contacts" className="gap-1.5">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t("emergency.tabs.contacts", "Contacts")}
            </span>
          </TabsTrigger>
          <TabsTrigger value="incoming" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t("emergency.tabs.incoming", "Incoming")}
            </span>
            {pendingIncoming > 0 && (
              <span className="ms-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-destructive px-1 text-xs font-medium text-destructive-foreground">
                {pendingIncoming}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="gap-1.5">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t("emergency.tabs.outgoing", "Outgoing")}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contacts">
          <TrustedContactList
            contacts={contacts}
            isLoading={isLoadingContacts}
            onAddClick={async () => {
              if (await verifyEmergency()) setAddDialogOpen(true);
            }}
            onRemove={handleRemoveContact}
          />
        </TabsContent>

        <TabsContent value="incoming">
          <RequestBanner
            requests={incomingRequests}
            isLoading={isLoadingRequests}
            onDeny={handleDenyRequest}
            onRefresh={fetchRequests}
          />
        </TabsContent>

        <TabsContent value="outgoing">
          <RequestTimeline
            requests={outgoingRequests}
            isLoading={isLoadingRequests}
            onRequestAccess={handleRequestAccess}
            onRefresh={fetchRequests}
          />
        </TabsContent>
      </Tabs>

      <AddContactDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={handleAddContact}
      />
      {verifyEmergencyDialog}
    </div>
  );
}
