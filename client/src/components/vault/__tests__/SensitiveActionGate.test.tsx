// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SensitiveActionGate } from "../SensitiveActionGate";

const trpcQueryMock = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => trpcQueryMock(...args),
}));

vi.mock("@/components/vault/MasterPasswordPrompt", () => ({
  MasterPasswordPrompt: ({
    open,
    onUnlock,
    onClose,
    mode,
    salt,
    verificationBlob,
  }: {
    open: boolean;
    onUnlock: () => void;
    onClose?: () => void;
    mode?: string;
    salt: string;
    verificationBlob?: string | null;
  }) =>
    open ? (
      <div data-testid="mp-prompt" data-mode={mode}>
        <span data-testid="mp-salt">{salt}</span>
        <span data-testid="mp-blob">{verificationBlob ?? ""}</span>
        <button data-testid="mp-verify" onClick={() => onUnlock()}>
          verify
        </button>
        <button data-testid="mp-cancel" onClick={() => onClose?.()}>
          cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

const VAULT = {
  kdfSalt: "abc-salt",
  encryptedVerificationBlob: "abc-blob",
};

beforeEach(() => {
  trpcQueryMock.mockReset();
});

describe("SensitiveActionGate", () => {
  it("intercepts the child click, opens verify-mode prompt, then fires original on verify", async () => {
    trpcQueryMock.mockResolvedValue([VAULT]);
    const onClick = vi.fn();
    render(
      <SensitiveActionGate action="export">
        <button onClick={onClick}>Export</button>
      </SensitiveActionGate>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Export"));
    });

    expect(onClick).not.toHaveBeenCalled();
    const prompt = await screen.findByTestId("mp-prompt");
    expect(prompt.getAttribute("data-mode")).toBe("verify");
    expect(screen.getByTestId("mp-salt").textContent).toBe("abc-salt");
    expect(screen.getByTestId("mp-blob").textContent).toBe("abc-blob");

    await act(async () => {
      fireEvent.click(screen.getByTestId("mp-verify"));
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("mp-prompt")).toBeNull();
  });

  it("cancel does NOT fire the original click", async () => {
    trpcQueryMock.mockResolvedValue([VAULT]);
    const onClick = vi.fn();
    render(
      <SensitiveActionGate action="changeMasterPassword">
        <button onClick={onClick}>Change</button>
      </SensitiveActionGate>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Change"));
    });
    await screen.findByTestId("mp-prompt");
    await act(async () => {
      fireEvent.click(screen.getByTestId("mp-cancel"));
    });

    expect(onClick).not.toHaveBeenCalled();
  });

  it("re-invoking after a successful verify prompts again (no caching)", async () => {
    trpcQueryMock.mockResolvedValue([VAULT]);
    const onClick = vi.fn();
    render(
      <SensitiveActionGate action="export">
        <button onClick={onClick}>Export</button>
      </SensitiveActionGate>,
    );

    for (let i = 0; i < 2; i++) {
      await act(async () => {
        fireEvent.click(screen.getByText("Export"));
      });
      await screen.findByTestId("mp-prompt");
      await act(async () => {
        fireEvent.click(screen.getByTestId("mp-verify"));
      });
    }
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("falls through when the vault has no verification blob (nothing to verify against)", async () => {
    trpcQueryMock.mockResolvedValue([{ kdfSalt: null, encryptedVerificationBlob: null }]);
    const onClick = vi.fn();
    render(
      <SensitiveActionGate action="emergencyAccess">
        <button onClick={onClick}>Emergency</button>
      </SensitiveActionGate>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText("Emergency"));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("mp-prompt")).toBeNull();
  });
});
