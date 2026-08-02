// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * LayoutTemplateProvider Unit Tests
 *
 * Covers initial state (localStorage + default), changeTemplate persistence
 * (localStorage + density class + DB mutation), and the unauthenticated bypass.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LayoutTemplateProvider,
  useLayoutTemplate,
} from "../LayoutTemplateProvider";

const mockMutateAsync = vi.fn().mockResolvedValue({ success: true });
const mockAuthState = { status: "unauthenticated" as "authenticated" | "unauthenticated" };

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, fb?: string) => fb || _k }),
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: () => mockAuthState,
}));

const mockUsePreference = vi.fn(() => ({
  data: undefined as string | undefined,
  isLoading: false,
  isFetched: true,
}));

vi.mock("@/hooks/useLayoutTemplate", () => ({
  useUserLayoutTemplatePreference: () => mockUsePreference(),
  useUpdateUserLayoutTemplate: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function TestConsumer() {
  const { template, templateConfig, changeTemplate, isSaving } =
    useLayoutTemplate();
  return (
    <div>
      <span data-testid="template">{template}</span>
      <span data-testid="viewMode">{templateConfig.viewMode}</span>
      <span data-testid="saving">{isSaving.toString()}</span>
      <button onClick={() => changeTemplate("compact")}>compact</button>
      <button onClick={() => changeTemplate("list")}>list</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <LayoutTemplateProvider>
      <TestConsumer />
    </LayoutTemplateProvider>
  );
}

// localStorage is a non-persisting vi.fn mock (tests/setup.ts): drive getItem
// via mockReturnValue and assert on setItem calls.
const getItem = () => localStorage.getItem as unknown as Mock;
const setItem = () => localStorage.setItem as unknown as Mock;
const STORAGE_KEY = "pssmngr-layout-template";

describe("LayoutTemplateProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getItem().mockReturnValue(null);
    mockAuthState.status = "unauthenticated";
    mockUsePreference.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetched: true,
    });
    document.documentElement.className = "";
  });

  it("defaults to 'default' (grid) when nothing is stored", () => {
    renderProvider();
    expect(screen.getByTestId("template")).toHaveTextContent("default");
    expect(screen.getByTestId("viewMode")).toHaveTextContent("grid");
  });

  it("initializes from localStorage", () => {
    getItem().mockReturnValue("compact");
    renderProvider();
    expect(screen.getByTestId("template")).toHaveTextContent("compact");
    expect(screen.getByTestId("viewMode")).toHaveTextContent("table");
  });

  it("ignores an invalid stored value", () => {
    getItem().mockReturnValue("bogus");
    renderProvider();
    expect(screen.getByTestId("template")).toHaveTextContent("default");
  });

  it("applies the density class to <html>", () => {
    getItem().mockReturnValue("list");
    renderProvider();
    expect(document.documentElement).toHaveClass("tpl-list");
    expect(document.documentElement).not.toHaveClass("tpl-compact");
  });

  it("changeTemplate updates state, localStorage and density class", async () => {
    const user = userEvent.setup();
    renderProvider();
    await user.click(screen.getByText("compact"));
    await waitFor(() =>
      expect(screen.getByTestId("template")).toHaveTextContent("compact")
    );
    expect(setItem()).toHaveBeenCalledWith(STORAGE_KEY, "compact");
    expect(document.documentElement).toHaveClass("tpl-compact");
  });

  it("does NOT call the DB mutation when unauthenticated", async () => {
    const user = userEvent.setup();
    renderProvider();
    await user.click(screen.getByText("compact"));
    await waitFor(() =>
      expect(screen.getByTestId("template")).toHaveTextContent("compact")
    );
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("calls the DB mutation when authenticated", async () => {
    mockAuthState.status = "authenticated";
    const user = userEvent.setup();
    renderProvider();
    await user.click(screen.getByText("list"));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith("list"));
  });

  it("fills from DB when localStorage is empty (new device)", async () => {
    mockAuthState.status = "authenticated";
    getItem().mockReturnValue(null);
    mockUsePreference.mockReturnValue({
      data: "compact",
      isLoading: false,
      isFetched: true,
    });
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("template")).toHaveTextContent("compact")
    );
    expect(setItem()).toHaveBeenCalledWith(STORAGE_KEY, "compact");
  });

  it("localStorage wins over the DB value", async () => {
    mockAuthState.status = "authenticated";
    getItem().mockReturnValue("list");
    mockUsePreference.mockReturnValue({
      data: "compact",
      isLoading: false,
      isFetched: true,
    });
    renderProvider();
    // give the DB-reconcile effect a chance to (not) run
    await act(async () => {});
    expect(screen.getByTestId("template")).toHaveTextContent("list");
  });

  it("throws when used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      /must be used within LayoutTemplateProvider/
    );
    spy.mockRestore();
  });
});
