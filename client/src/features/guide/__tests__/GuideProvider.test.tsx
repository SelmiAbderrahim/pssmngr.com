// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * GuideProvider tests: optimistic setEnabled → rollback on tRPC error.
 */

import { render, screen, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const trpcQuery = vi.fn();
const trpcMutation = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => trpcQuery(...args),
  trpcMutation: (...args: unknown[]) => trpcMutation(...args),
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: () => ({ status: "authenticated" }),
}));

import { GuideProvider, useGuide } from "../GuideProvider";

const Probe = () => {
  const { state, setEnabled } = useGuide();
  return (
    <div>
      <span data-testid="enabled">{String(state.enabled)}</span>
      <span data-testid="error">{state.error ?? ""}</span>
      <button onClick={() => setEnabled(false)}>disable</button>
    </div>
  );
};

const wrap = (ui: React.ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GuideProvider>{ui}</GuideProvider>
    </QueryClientProvider>,
  );
};

describe("GuideProvider", () => {
  it("optimistically flips enabled and commits on success", async () => {
    trpcQuery.mockResolvedValue(true);
    trpcMutation.mockResolvedValue({ success: true });
    wrap(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("enabled").textContent).toBe("true"),
    );
    await act(async () => {
      screen.getByText("disable").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("enabled").textContent).toBe("false"),
    );
  });

  it("rolls back and stores an error on mutation failure", async () => {
    trpcQuery.mockResolvedValue(true);
    trpcMutation.mockRejectedValue(new Error("net down"));
    wrap(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("enabled").textContent).toBe("true"),
    );
    await act(async () => {
      screen.getByText("disable").click();
    });
    await waitFor(() => {
      expect(screen.getByTestId("enabled").textContent).toBe("true");
      expect(screen.getByTestId("error").textContent).toContain("Could not");
    });
  });

  it("throws when useGuide is called outside a provider", () => {
    const bad = () => render(<Probe />);
    // React 18 collapses render-time throws into a component error.
    expect(bad).toThrow(/GuideProvider/);
  });
});
