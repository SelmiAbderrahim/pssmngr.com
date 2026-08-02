// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * EphemeralShareAccessPage Component Tests
 *
 * Tests the ephemeral share access page logic by extracting the component
 * from the route module. Covers loading, error, passphrase, and decrypted states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────

// Mock TanStack Router — createFileRoute returns a builder that attaches useParams
const mockLinkId = { linkId: "test-link-id" };
vi.mock("@tanstack/react-router", () => {
  const routeObj = {
    useParams: () => mockLinkId,
    useSearch: () => ({}),
  };
  return {
    createFileRoute: () => {
      // createFileRoute("/share/$linkId") returns a function that takes { component }
      const builder = (opts: { component: unknown }) => {
        // Attach the component to the route object for extraction
        (routeObj as Record<string, unknown>).options = opts;
        return routeObj;
      };
      // The builder itself also needs useParams etc. for when the module
      // stores `const Route = createFileRoute(...)({ component })` and later
      // calls `Route.useParams()` inside the component.
      Object.assign(builder, routeObj);
      return builder;
    },
    useNavigate: () => vi.fn(),
  };
});

// Mock Helmet
vi.mock("react-helmet-async", () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock trpcMutation
const mockTrpcMutation = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

// Mock @pssmngr/crypto — decryptEphemeralShare is dynamically imported
const mockDecryptEphemeralShare = vi.fn();
vi.mock("@pssmngr/crypto", () => ({
  decryptEphemeralShare: (...args: unknown[]) => mockDecryptEphemeralShare(...args),
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

  // Set URL fragment (link key)
  Object.defineProperty(window, "location", {
    value: { ...window.location, hash: "#test-key-123" },
    writable: true,
    configurable: true,
  });

  // Mock clipboard
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });

  // Extract the component from the route module
  const mod = await import("@/routes/share.$linkId");
  const route = mod.Route as unknown as { options?: { component: React.ComponentType } };
  EphemeralShareAccessPage = route.options?.component ?? (() => null);
});

// ── Tests ──────────────────────────────────────────────────────────

describe("EphemeralShareAccessPage", () => {
  it("shows loading state initially", () => {
    mockTrpcMutation.mockReturnValue(new Promise(() => {}));
    render(<EphemeralShareAccessPage />);
    expect(screen.getByText("ephemeral.loading")).toBeInTheDocument();
  });

  it("shows error when URL fragment is missing", async () => {
    Object.defineProperty(window, "location", {
      value: { ...window.location, hash: "" },
      writable: true,
      configurable: true,
    });

    render(<EphemeralShareAccessPage />);
    await waitFor(() => {
      expect(screen.getByText("ephemeral.errorTitle")).toBeInTheDocument();
    });
  });

  it("shows error when server fetch fails", async () => {
    mockTrpcMutation.mockRejectedValue(new Error("Link expired"));
    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.errorTitle")).toBeInTheDocument();
      expect(screen.getByText("Link expired")).toBeInTheDocument();
    });
  });

  it("shows passphrase prompt when link requires passphrase", async () => {
    mockTrpcMutation.mockResolvedValue({ hasPassphrase: true });
    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.passphraseRequired")).toBeInTheDocument();
    });
  });

  it("decrypts and displays fields for a link without passphrase", async () => {
    mockTrpcMutation.mockResolvedValue({ hasPassphrase: false });
    mockDecryptEphemeralShare.mockResolvedValue(
      JSON.stringify({ username: "admin", password: "secret123" }),
    );

    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.decryptedTitle")).toBeInTheDocument();
      // Labels are formatted from camelCase keys
      expect(screen.getByText("Username")).toBeInTheDocument();
      expect(screen.getByText("Password")).toBeInTheDocument();
    });
  });

  it("shows decryption error on failure", async () => {
    mockTrpcMutation.mockResolvedValue({ hasPassphrase: false });
    mockDecryptEphemeralShare.mockRejectedValue(new Error("bad cipher"));

    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.errorTitle")).toBeInTheDocument();
    });
  });

  it("hides sensitive fields by default and toggles visibility", async () => {
    mockTrpcMutation.mockResolvedValue({ hasPassphrase: false });
    mockDecryptEphemeralShare.mockResolvedValue(
      JSON.stringify({ username: "admin", password: "secret123" }),
    );

    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.decryptedTitle")).toBeInTheDocument();
    });

    // Password field should have type="password" (hidden by default)
    const inputs = screen.getAllByRole("textbox");
    // Non-sensitive field (username) is type="text", sensitive (password) is type="password"
    // Note: type="password" inputs aren't role="textbox" — they need a different query
    const passwordInput = document.querySelector('input[type="password"]');
    expect(passwordInput).toBeTruthy();

    // Toggle visibility — the Eye button is next to password field
    const eyeButtons = screen.getAllByRole("button");
    const toggleBtn = eyeButtons.find((b) => b.querySelector("svg"));
    if (toggleBtn) {
      fireEvent.click(toggleBtn);
    }
  });

  it("submits passphrase and decrypts", async () => {
    mockTrpcMutation.mockResolvedValue({ hasPassphrase: true });
    mockDecryptEphemeralShare.mockResolvedValue(
      JSON.stringify({ url: "https://example.com" }),
    );

    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.passphraseRequired")).toBeInTheDocument();
    });

    // Find the passphrase input by id
    const input = document.getElementById("access-passphrase") as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: "my-secret" } });

    const form = input.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockDecryptEphemeralShare).toHaveBeenCalledWith(
        { hasPassphrase: true },
        "test-key-123",
        "my-secret",
      );
    });
  });

  it("disables decrypt button when passphrase is empty", async () => {
    mockTrpcMutation.mockResolvedValue({ hasPassphrase: true });

    render(<EphemeralShareAccessPage />);

    await waitFor(() => {
      expect(screen.getByText("ephemeral.passphraseRequired")).toBeInTheDocument();
    });

    // Submit button should be disabled with empty passphrase
    const buttons = screen.getAllByRole("button");
    const submitBtn = buttons.find((b) => b.getAttribute("type") === "submit");
    expect(submitBtn).toBeTruthy();
    expect(submitBtn!).toBeDisabled();
  });
});
