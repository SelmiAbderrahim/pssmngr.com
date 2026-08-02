// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/auth-client";
import { deriveAuthenticationSecret } from "@/lib/auth-credential";
import { getVaultKey } from "@/lib/vault-keys";
import type {
  Enable2FAResponse,
  Verify2FAResponse,
  SecurityOperationResult,
  BackupCodes as BackupCodesType,
} from "@/types/security";

const SECURITY_KEYS = {
  sessions: ["security", "sessions"] as const,
  backupCodes: ["security", "backup-codes"] as const,
};

async function getAuthenticationSecret(): Promise<string> {
  const vaultKey = getVaultKey();
  if (!vaultKey) {
    throw new Error("Unlock your vault before changing security settings");
  }

  try {
    return await deriveAuthenticationSecret(vaultKey);
  } finally {
    vaultKey.fill(0);
  }
}

// =============================================================================
// Two-Factor Authentication
// =============================================================================

export function useEnable2FA() {
  return useMutation<Enable2FAResponse, Error>({
    mutationFn: async () => {
      const authenticationSecret = await getAuthenticationSecret();
      const result = await authClient.twoFactor.enable({
        password: authenticationSecret,
      });
      if (result.error) {
        return {
          success: false,
          error: result.error.message || "Failed to enable 2FA",
        };
      }
      return {
        success: true,
        setup: {
          secret: result.data?.totpURI || "",
          qrCodeUrl: result.data?.totpURI || "",
          backupCodes: result.data?.backupCodes || [],
        },
      };
    },
  });
}

export function useVerify2FA() {
  const queryClient = useQueryClient();
  return useMutation<Verify2FAResponse, Error, string>({
    mutationFn: async (code: string) => {
      const result = await authClient.twoFactor.verifyTotp({ code });
      if (result.error) {
        return {
          success: false,
          error: result.error.message || "Verification failed",
        };
      }
      return {
        success: true,
        backupCodes: (result.data as any)?.backupCodes,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SECURITY_KEYS.backupCodes });
    },
  });
}

export function useDisable2FA() {
  const queryClient = useQueryClient();
  return useMutation<SecurityOperationResult, Error, string>({
    mutationFn: async (code: string) => {
      const verification = await authClient.twoFactor.verifyTotp({ code });
      if (verification.error) {
        return {
          success: false,
          error: verification.error.message || "Invalid verification code",
        };
      }

      const authenticationSecret = await getAuthenticationSecret();
      const result = await authClient.twoFactor.disable({
        password: authenticationSecret,
      });
      if (result.error) {
        return {
          success: false,
          error: result.error.message || "Failed to disable 2FA",
        };
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SECURITY_KEYS.backupCodes });
    },
  });
}

// =============================================================================
// Backup Codes
// =============================================================================

export function useBackupCodes() {
  return useQuery<BackupCodesType | null>({
    queryKey: SECURITY_KEYS.backupCodes,
    queryFn: async () => {
      try {
        const result = await (authClient.twoFactor as any).getBackupCodes();
        if (result.error || !result.data) return null;
        const codes = result.data.backupCodes || [];
        return {
          codes,
          generatedAt: new Date().toISOString(),
          usedCount: 0,
          totalCount: codes.length,
        };
      } catch {
        return null;
      }
    },
    retry: false,
  });
}

export function useRegenerateBackupCodes() {
  const queryClient = useQueryClient();
  return useMutation<string[] | null, Error, string>({
    mutationFn: async (code: string) => {
      const verification = await authClient.twoFactor.verifyTotp({ code });
      if (verification.error) return null;

      const authenticationSecret = await getAuthenticationSecret();
      const result = await authClient.twoFactor.generateBackupCodes({
        password: authenticationSecret,
      });
      if (result.error) return null;
      return result.data?.backupCodes || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SECURITY_KEYS.backupCodes });
    },
  });
}

// =============================================================================
// Sessions
// =============================================================================

export function useSessions() {
  return useQuery({
    queryKey: SECURITY_KEYS.sessions,
    queryFn: async () => {
      const [result, current] = await Promise.all([
        authClient.listSessions(),
        authClient.getSession(),
      ]);
      if (result.error || !result.data) {
        return { sessions: [], total: 0 };
      }
      const sessions = result.data.map((s: any) => ({
        // Better Auth revokes sessions by token, not by database id.
        id: s.token,
        userAgent: s.userAgent || "",
        ipAddress: s.ipAddress || "",
        createdAt: s.createdAt,
        lastActiveAt: s.updatedAt || s.createdAt,
        isCurrent: s.token === current.data?.session.token,
        device: parseUserAgent(s.userAgent),
      }));
      return { sessions, total: sessions.length };
    },
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation<SecurityOperationResult, Error, string>({
    mutationFn: async (sessionId: string) => {
      const result = await authClient.revokeSession({ token: sessionId });
      if (result.error) {
        return {
          success: false,
          error: result.error.message || "Failed to revoke session",
        };
      }
      return { success: true, revokedSessionId: sessionId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SECURITY_KEYS.sessions });
    },
  });
}

export function useRevokeAllSessions() {
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  return useMutation<SecurityOperationResult, Error, void>({
    mutationFn: async () => {
      const result = await authClient.revokeOtherSessions();
      if (result.error) {
        return {
          success: false,
          error: result.error.message || "Failed to revoke sessions",
        };
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SECURITY_KEYS.sessions });
    },
  });
}

// =============================================================================
// Passkeys
// =============================================================================

const PASSKEY_QUERY_KEY = ["security", "passkeys"] as const;

export interface Passkey {
  id: string;
  name: string | null;
  credentialID: string;
  deviceType: string;
  backedUp: boolean;
  transports: string | null;
  createdAt: string | null;
}

export function usePasskeys() {
  return useQuery<Passkey[]>({
    queryKey: PASSKEY_QUERY_KEY,
    queryFn: async () => {
      const { trpcQuery } = await import("@/lib/api/trpc");
      return trpcQuery<Passkey[]>("passkeys", "list");
    },
  });
}

/**
 * Encode a Uint8Array to base64url string.
 */
function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode a base64url string to Uint8Array.
 */
function fromBase64Url(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function useRegisterPasskey() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { name?: string }>({
    mutationFn: async ({ name }) => {
      const { trpcMutation } = await import("@/lib/api/trpc");

      // Step 1: Get registration options from server
      const options = await trpcMutation<any>(
        "passkeys",
        "beginRegistration",
        undefined,
      );

      // Step 2: Convert server options to WebAuthn PublicKeyCredentialCreationOptions
      const publicKey: PublicKeyCredentialCreationOptions = {
        ...options,
        challenge: fromBase64Url(options.challenge),
        user: {
          ...options.user,
          id: fromBase64Url(options.user.id),
        },
        excludeCredentials: (options.excludeCredentials || []).map(
          (cred: any) => ({
            ...cred,
            id: fromBase64Url(cred.id),
          }),
        ),
      };

      // Step 3: Prompt browser WebAuthn API
      const credential = (await navigator.credentials.create({
        publicKey,
      })) as PublicKeyCredential;

      if (!credential) {
        throw new Error("No credential returned");
      }

      const response = credential.response as AuthenticatorAttestationResponse;

      // Step 4: Encode response for server
      const registrationResponse = {
        id: credential.id,
        rawId: toBase64Url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: toBase64Url(response.clientDataJSON),
          attestationObject: toBase64Url(response.attestationObject),
          authenticatorData: response.getAuthenticatorData
            ? toBase64Url(response.getAuthenticatorData())
            : undefined,
          transports: response.getTransports
            ? response.getTransports()
            : undefined,
          publicKey: response.getPublicKey
            ? toBase64Url(response.getPublicKey()!)
            : undefined,
          publicKeyAlgorithm: response.getPublicKeyAlgorithm
            ? response.getPublicKeyAlgorithm()
            : undefined,
        },
        clientExtensionResults: credential.getClientExtensionResults(),
        authenticatorAttachment: credential.authenticatorAttachment,
      };

      // Step 5: Verify registration on server
      return trpcMutation("passkeys", "finishRegistration", {
        name,
        credential: registrationResponse,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PASSKEY_QUERY_KEY });
    },
  });
}

export function useDeletePasskey() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: async (passkeyId: string) => {
      const { trpcMutation } = await import("@/lib/api/trpc");
      return trpcMutation<{ success: boolean }>("passkeys", "delete", {
        passkeyId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PASSKEY_QUERY_KEY });
    },
  });
}

// =============================================================================
// Helpers
// =============================================================================

function parseUserAgent(ua?: string | null): {
  type: "desktop" | "mobile" | "tablet" | "unknown";
  browser?: string;
  os?: string;
} {
  if (!ua) return { type: "unknown" };

  const isMobile = /mobile|android|iphone/i.test(ua);
  const isTablet = /tablet|ipad/i.test(ua);

  let browser: string | undefined;
  if (/firefox/i.test(ua)) browser = "Firefox";
  else if (/edg/i.test(ua)) browser = "Edge";
  else if (/chrome/i.test(ua)) browser = "Chrome";
  else if (/safari/i.test(ua)) browser = "Safari";

  let os: string | undefined;
  if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad/i.test(ua)) os = "iOS";

  return {
    type: isTablet ? "tablet" : isMobile ? "mobile" : "desktop",
    browser,
    os,
  };
}
