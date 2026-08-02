// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

/**
 * Derive the opaque credential sent to the authentication service.
 *
 * The vault key is already the output of Argon2id(master password + Secret
 * Key + salt). A domain-separated HMAC gives authentication its own 256-bit
 * secret without exposing the master password or reusing the vault key itself.
 */
export async function deriveAuthenticationSecret(
  vaultKey: Uint8Array,
): Promise<string> {
  if (vaultKey.length !== 32) {
    throw new Error("Vault key must be exactly 32 bytes");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    vaultKey as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const context = new TextEncoder().encode("pssmngr/authentication/v1");
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, context as BufferSource),
  );

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
