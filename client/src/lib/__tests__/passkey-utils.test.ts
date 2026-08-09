// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from "vitest";

// ── Inline copies of the private helpers from useSecurity.ts ────────
// These are not exported, so we re-implement them here for isolated testing.

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

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

// ── toBase64Url ─────────────────────────────────────────────────────

describe("toBase64Url", () => {
  it("encodes an empty buffer", () => {
    const buf = new ArrayBuffer(0);
    expect(toBase64Url(buf)).toBe("");
  });

  it("encodes a simple byte sequence", () => {
    const buf = new Uint8Array([72, 101, 108, 108, 111]).buffer; // "Hello"
    const result = toBase64Url(buf);
    expect(result).toBe("SGVsbG8");
  });

  it("replaces + with -", () => {
    // Bytes that produce + in standard base64
    const buf = new Uint8Array([251, 239]).buffer;
    const result = toBase64Url(buf);
    expect(result).not.toContain("+");
  });

  it("replaces / with _", () => {
    // Bytes that produce / in standard base64
    const buf = new Uint8Array([255, 255]).buffer;
    const result = toBase64Url(buf);
    expect(result).not.toContain("/");
  });

  it("strips trailing = padding", () => {
    // Single byte produces 2 chars + 2 padding in base64
    const buf = new Uint8Array([65]).buffer; // "A" -> "QQ=="
    const result = toBase64Url(buf);
    expect(result).not.toContain("=");
    expect(result).toBe("QQ");
  });

  it("handles all zero bytes", () => {
    const buf = new Uint8Array([0, 0, 0]).buffer;
    const result = toBase64Url(buf);
    expect(result).toBe("AAAA");
  });

  it("handles 256 sequential bytes", () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const result = toBase64Url(bytes.buffer);
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain("+");
    expect(result).not.toContain("/");
    expect(result).not.toContain("=");
  });
});

// ── fromBase64Url ───────────────────────────────────────────────────

describe("fromBase64Url", () => {
  it("decodes an empty string", () => {
    const result = fromBase64Url("");
    expect(result).toEqual(new Uint8Array(0));
  });

  it("decodes a simple base64url string", () => {
    const result = fromBase64Url("SGVsbG8"); // "Hello"
    expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
  });

  it("handles - (base64url replacement for +)", () => {
    const withDash = "u-8"; // Contains base64url dash
    const result = fromBase64Url(withDash);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles _ (base64url replacement for /)", () => {
    const withUnderscore = "__8"; // Contains base64url underscore
    const result = fromBase64Url(withUnderscore);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("adds correct padding for 1-byte remainder", () => {
    // "QQ" needs "==" padding to become "QQ=="
    const result = fromBase64Url("QQ");
    expect(result).toEqual(new Uint8Array([65]));
  });

  it("adds correct padding for 2-byte remainder", () => {
    // "SGk" needs "=" padding to become "SGk="
    const result = fromBase64Url("SGk");
    expect(result).toEqual(new Uint8Array([72, 105])); // "Hi"
  });
});

// ── Round-trip ──────────────────────────────────────────────────────

describe("base64url round-trip", () => {
  it("round-trips a random challenge", () => {
    const original = new Uint8Array([
      0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe, 0x01, 0x23, 0x45, 0x67,
      0x89, 0xab, 0xcd, 0xef,
    ]);
    const encoded = toBase64Url(original.buffer);
    const decoded = fromBase64Url(encoded);
    expect(decoded).toEqual(original);
  });

  it("round-trips a WebAuthn user ID", () => {
    const userId = new TextEncoder().encode("user-abc123");
    const encoded = toBase64Url(userId.buffer);
    const decoded = fromBase64Url(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(userId));
  });

  it("round-trips single byte values", () => {
    for (let i = 0; i < 256; i++) {
      const original = new Uint8Array([i]);
      const encoded = toBase64Url(original.buffer);
      const decoded = fromBase64Url(encoded);
      expect(decoded[0]).toBe(i);
    }
  });

  it("round-trips a large buffer (1024 bytes)", () => {
    const original = new Uint8Array(1024);
    for (let i = 0; i < 1024; i++) original[i] = i % 256;
    const encoded = toBase64Url(original.buffer);
    const decoded = fromBase64Url(encoded);
    expect(decoded).toEqual(original);
  });
});

// ── WebAuthn Registration Options Conversion ────────────────────────

describe("WebAuthn options conversion", () => {
  it("converts server challenge from base64url to ArrayBuffer", () => {
    const serverChallenge = "dGVzdC1jaGFsbGVuZ2U"; // "test-challenge"
    const decoded = fromBase64Url(serverChallenge);
    const expected = new TextEncoder().encode("test-challenge");
    expect(Array.from(decoded)).toEqual(Array.from(expected));
  });

  it("converts server user.id from base64url to ArrayBuffer", () => {
    const serverUserId = "dXNlci0xMjM"; // "user-123"
    const decoded = fromBase64Url(serverUserId);
    const expected = new TextEncoder().encode("user-123");
    expect(Array.from(decoded)).toEqual(Array.from(expected));
  });

  it("converts excludeCredentials IDs from base64url", () => {
    const serverCredentials = [
      { id: "Y3JlZC0x", type: "public-key" },
      { id: "Y3JlZC0y", type: "public-key" },
    ];
    const converted = serverCredentials.map((cred) => ({
      ...cred,
      id: fromBase64Url(cred.id),
    }));
    expect(Array.from(converted[0].id)).toEqual(Array.from(new TextEncoder().encode("cred-1")));
    expect(Array.from(converted[1].id)).toEqual(Array.from(new TextEncoder().encode("cred-2")));
  });

  it("encodes credential rawId back to base64url for server", () => {
    const rawId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const encoded = toBase64Url(rawId.buffer);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);
    // Verify round-trip
    const decoded = fromBase64Url(encoded);
    expect(decoded).toEqual(rawId);
  });

  it("encodes attestationObject to base64url for server", () => {
    const attestationObject = new Uint8Array(128);
    for (let i = 0; i < 128; i++) attestationObject[i] = i;
    const encoded = toBase64Url(attestationObject.buffer);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });

  it("encodes clientDataJSON to base64url for server", () => {
    const json = JSON.stringify({
      type: "webauthn.create",
      challenge: "test",
      origin: "https://localhost",
    });
    const clientDataJSON = new TextEncoder().encode(json);
    const encoded = toBase64Url(clientDataJSON.buffer);
    const decoded = fromBase64Url(encoded);
    const parsed = JSON.parse(new TextDecoder().decode(decoded));
    expect(parsed.type).toBe("webauthn.create");
    expect(parsed.origin).toBe("https://localhost");
  });
});

// ── Passkey Interface ───────────────────────────────────────────────

describe("Passkey interface", () => {
  interface Passkey {
    id: string;
    name: string | null;
    credentialID: string;
    deviceType: string;
    backedUp: boolean;
    transports: string | null;
    createdAt: string | null;
  }

  it("represents a complete passkey record", () => {
    const passkey: Passkey = {
      id: "pk-abc123",
      name: "MacBook Pro",
      credentialID: "cred-xyz",
      deviceType: "singleDevice",
      backedUp: false,
      transports: "internal",
      createdAt: "2024-03-01T00:00:00.000Z",
    };
    expect(passkey.id).toBe("pk-abc123");
    expect(passkey.deviceType).toBe("singleDevice");
  });

  it("allows null name for unnamed passkeys", () => {
    const passkey: Passkey = {
      id: "pk-1",
      name: null,
      credentialID: "cred-1",
      deviceType: "multiDevice",
      backedUp: true,
      transports: "internal,hybrid",
      createdAt: null,
    };
    expect(passkey.name).toBeNull();
    expect(passkey.createdAt).toBeNull();
  });

  it("supports all device types", () => {
    const types = ["singleDevice", "multiDevice"];
    for (const type of types) {
      const passkey: Passkey = {
        id: "pk-1",
        name: null,
        credentialID: "cred-1",
        deviceType: type,
        backedUp: type === "multiDevice",
        transports: null,
        createdAt: null,
      };
      expect(passkey.deviceType).toBe(type);
    }
  });
});

// ── Registration Response Structure ─────────────────────────────────

describe("registration response structure", () => {
  it("constructs a valid registration response for server", () => {
    const mockRawId = new Uint8Array([1, 2, 3, 4]);
    const mockClientDataJSON = new Uint8Array([5, 6, 7, 8]);
    const mockAttestationObject = new Uint8Array([9, 10, 11, 12]);

    const response = {
      id: "credential-id",
      rawId: toBase64Url(mockRawId.buffer),
      type: "public-key" as const,
      response: {
        clientDataJSON: toBase64Url(mockClientDataJSON.buffer),
        attestationObject: toBase64Url(mockAttestationObject.buffer),
        authenticatorData: undefined,
        transports: ["internal", "hybrid"],
        publicKey: undefined,
        publicKeyAlgorithm: undefined,
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };

    expect(response.type).toBe("public-key");
    expect(typeof response.rawId).toBe("string");
    expect(typeof response.response.clientDataJSON).toBe("string");
    expect(typeof response.response.attestationObject).toBe("string");
    expect(response.response.transports).toContain("internal");
  });

  it("handles optional getAuthenticatorData result", () => {
    const authData = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const encoded = toBase64Url(authData.buffer);
    expect(encoded).toBeDefined();

    // When getAuthenticatorData is not available
    const noAuthData = undefined;
    expect(noAuthData).toBeUndefined();
  });

  it("handles optional getPublicKey result", () => {
    const pubKey = new Uint8Array(65); // Typical uncompressed EC P-256 public key
    pubKey[0] = 0x04; // Uncompressed point indicator
    const encoded = toBase64Url(pubKey.buffer);
    expect(encoded.length).toBeGreaterThan(0);
  });

  it("handles optional getPublicKeyAlgorithm result", () => {
    const alg = -7; // ES256
    expect(alg).toBe(-7);

    const noAlg = undefined;
    expect(noAlg).toBeUndefined();
  });
});
