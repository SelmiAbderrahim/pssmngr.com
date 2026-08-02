// Copyright (c) 2026 Password Manager contributors
/**
 * Ephemeral Share Route Tests
 *
 * Tests the share.$linkId.tsx public route for ephemeral sharing.
 * Covers loading, error, passphrase, and decrypted states.
 * Verifies the decryption key is read from URL fragment (never sent to server).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────

const mockLinkId = { linkId: "test-link-id" };
vi.mock("@tanstack/react-router", () => {
  const routeObj = {
    useParams: () => mockLinkId,
    useSearch: () => ({}),
  };
  return {
    createFileRoute: () => {
      const builder = (opts: { component: unknown }) => {
        (routeObj as Record<string, unknown>).options = opts;
        return routeObj;
      };
      Object.assign(builder, routeObj);
      return builder;
    },
    useNavigate: () => vi.fn(),
  };
});

vi.mock("react-helmet-async", () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockTrpcMutation = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

const mockDecryptEphemeralShare = vi.fn();
vi.mock("@pssmngr/crypto", () => ({
  decryptEphemeralShare: (...args: unknown[]) =>
    mockDecryptEphemeralShare(...args),
}));

// ── Setup ──────────────────────────────────────────────────────────

let EphemeralShareAccessPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  // The route module keeps an in-flight request cache (Map) at module scope to
  // dedupe concurrent ephemeral-link fetches. Reset modules so each test gets a
  // fresh, empty cache — otherwise the never-resolving promise from the loading
  // test poisons subsequent tests and pins them on the loading state.
  vi.resetModules();

  Object.defineProperty(window, "location", {
    value: { ...window.location, hash: "#test-key-abc" },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });

  const mod = await import("@/routes/share.$linkId");
  const route = mod.Route as unknown as {
    options?: { component: React.ComponentType };
  };
  EphemeralShareAccessPage = route.options?.component ?? (() => null);
});

// ── Tests ──────────────────────────────────────────────────────────

describe("share.$linkId route", () => {
  it("renders loading state initially", () => {
    mockTrpcMutation.mockReturnValue(new Promise(() => {}));
    render(<EphemeralShareAccessPage />);
    expect(screen.getByText("ephemeral.loading")).toBeInTheDocument();
  });

  it("shows decrypted content for a valid link", async () => {
    mockTrpcMutation.mockResolvedValue({ hasPassphrase: false });
    mockDecryptEphemeralShare.mockResolvedValue(
      JSON.stringify({ username: "admin", password: "s3cret" }),
    );

    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.decryptedTitle")).toBeInTheDocument();
    });
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    // Verify crypto was called with the URL fragment key (not sent to server)
    expect(mockDecryptEphemeralShare).toHaveBeenCalledWith(
      { hasPassphrase: false },
      "test-key-abc",
      undefined,
    );
  });

  it("shows expiration message for an expired link", async () => {
    mockTrpcMutation.mockRejectedValue(new Error("This link has expired."));
    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.errorTitle")).toBeInTheDocument();
      expect(screen.getByText("This link has expired.")).toBeInTheDocument();
    });
  });

  it("shows error for an invalid link (missing URL fragment)", async () => {
    Object.defineProperty(window, "location", {
      value: { ...window.location, hash: "" },
      writable: true,
      configurable: true,
    });

    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.errorTitle")).toBeInTheDocument();
    });
    // trpcMutation should NOT have been called — no key means no fetch
    expect(mockTrpcMutation).not.toHaveBeenCalled();
  });

  it("shows passphrase input for a passphrase-protected link", async () => {
    mockTrpcMutation.mockResolvedValue({ hasPassphrase: true });
    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(
        screen.getByText("ephemeral.passphraseRequired"),
      ).toBeInTheDocument();
    });
    const input = document.getElementById(
      "access-passphrase",
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe("password");
  });

  it("reveals content after entering correct passphrase", async () => {
    mockTrpcMutation.mockResolvedValue({
      hasPassphrase: true,
      encryptedBlob: "blob",
    });
    mockDecryptEphemeralShare.mockResolvedValue(
      JSON.stringify({ url: "https://example.com", notes: "my notes" }),
    );

    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(
        screen.getByText("ephemeral.passphraseRequired"),
      ).toBeInTheDocument();
    });

    const input = document.getElementById(
      "access-passphrase",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "correct-pass" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.decryptedTitle")).toBeInTheDocument();
    });
    expect(screen.getByText("Url")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(mockDecryptEphemeralShare).toHaveBeenCalledWith(
      { hasPassphrase: true, encryptedBlob: "blob" },
      "test-key-abc",
      "correct-pass",
    );
  });

  it("shows error for wrong passphrase", async () => {
    mockTrpcMutation.mockResolvedValue({ hasPassphrase: true });
    mockDecryptEphemeralShare.mockRejectedValue(
      new Error("Decryption failed"),
    );

    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(
        screen.getByText("ephemeral.passphraseRequired"),
      ).toBeInTheDocument();
    });

    const input = document.getElementById(
      "access-passphrase",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "wrong-pass" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.errorTitle")).toBeInTheDocument();
    });
  });

  it("reads decryption key from URL fragment and never sends it to server", async () => {
    // Set a specific fragment
    Object.defineProperty(window, "location", {
      value: { ...window.location, hash: "#my-secret-key-xyz" },
      writable: true,
      configurable: true,
    });

    mockTrpcMutation.mockResolvedValue({ hasPassphrase: false });
    mockDecryptEphemeralShare.mockResolvedValue(
      JSON.stringify({ username: "test" }),
    );

    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.decryptedTitle")).toBeInTheDocument();
    });

    // The tRPC call should only receive the linkId, NOT the key
    expect(mockTrpcMutation).toHaveBeenCalledWith(
      "sharing",
      "accessEphemeralLink",
      { linkId: "test-link-id" },
    );

    // The key is only passed to the client-side decrypt function
    expect(mockDecryptEphemeralShare).toHaveBeenCalledWith(
      { hasPassphrase: false },
      "my-secret-key-xyz",
      undefined,
    );
  });
});
