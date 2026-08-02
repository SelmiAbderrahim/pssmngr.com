// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────

const mockTrpcMutation = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

let mockAuthState = {
  user: {
    name: "Test User",
    email: "test@example.com",
    createdAt: 1700000000000,
  },
  isLoading: false,
};
vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: () => mockAuthState,
}));

const mockSetAutoLockTimeout = vi.fn();
vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    setAutoLockTimeout: (...args: unknown[]) => mockSetAutoLockTimeout(...args),
  },
  getPersistentUnlockDays: () => 30,
  setPersistentUnlockDays: vi.fn(),
}));

const mockIsEnrollmentDeferred = vi.fn(() => false);
vi.mock("@/services/keypair-manager", () => ({
  enrollDeviceInBackground: vi.fn().mockResolvedValue(true),
  isEnrollmentDeferred: () => mockIsEnrollmentDeferred(),
}));

vi.mock(
  "@/components/dashboard/settings/preferences/LanguagePreference",
  () => ({
    LanguagePreference: () =>
      React.createElement(
        "div",
        { "data-testid": "language-preference" },
        "Language Preference",
      ),
  }),
);

vi.mock(
  "@/components/dashboard/settings/preferences/LayoutTemplatePreference",
  () => ({
    LayoutTemplatePreference: () =>
      React.createElement(
        "div",
        { "data-testid": "layout-template-preference" },
        "Layout Template Preference",
      ),
  }),
);

// The GuideProvider is mounted in the dashboard route above this page, so
// tests that render this page standalone stub the toggle.
vi.mock("@/features/guide", () => ({
  GuideMeToggle: () =>
    React.createElement(
      "div",
      { "data-testid": "guide-me-toggle" },
      "Guide me toggle",
    ),
}));

let mockSearchTab: string | undefined;
const mockNavigate = vi.fn();
const mockScrollIntoView = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({
    ...opts,
    useSearch: () => {
      const validateSearch = opts.validateSearch as
        | ((search: Record<string, unknown>) => { tab?: string })
        | undefined;
      return validateSearch
        ? validateSearch({ tab: mockSearchTab })
        : { tab: mockSearchTab };
    },
  }),
  Link: React.forwardRef<
    HTMLAnchorElement,
    {
      to: string;
      children: React.ReactNode;
      className?: string;
      search?: unknown;
      hash?: string;
      [key: string]: unknown;
    }
  >(({ to, children, className, search: _search, hash: _hash, ...rest }, ref) =>
    React.createElement("a", { ref, href: to, className, ...rest }, children),
  ),
  useNavigate: () => mockNavigate,
}));

// vi.mock calls are hoisted above imports, so this import sees the mocked router
import { Route } from "../settings.index";
const SettingsPage = (Route as unknown as { component: React.ComponentType })
  .component;

// ── Tests ─────────────────────────────────────────────────────────

describe("SettingsIndexPage", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = mockScrollIntoView;
    mockScrollIntoView.mockReset();
    mockTrpcMutation.mockReset();
    mockSetAutoLockTimeout.mockReset();
    mockIsEnrollmentDeferred.mockReset();
    mockIsEnrollmentDeferred.mockReturnValue(false);
    mockNavigate.mockReset();
    mockSearchTab = undefined;
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    vi.mocked(localStorage.setItem).mockClear();
    vi.mocked(localStorage.removeItem).mockClear();
    mockAuthState = {
      user: {
        name: "Test User",
        email: "test@example.com",
        createdAt: 1700000000000,
      },
      isLoading: false,
    };
  });

  it("shows loading skeletons when auth is loading", () => {
    mockAuthState = { ...mockAuthState, isLoading: true };
    render(<SettingsPage />);
    const skeletons = document.querySelectorAll("[class*='animate-pulse']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders profile card with user details", () => {
    render(<SettingsPage />);
    expect(screen.getByDisplayValue("Test User")).toBeInTheDocument();
    expect(screen.getByDisplayValue("test@example.com")).toBeInTheDocument();
  });

  it("renders member since row", () => {
    render(<SettingsPage />);
    expect(
      screen.getByText(/settings\.memberSince|Member since/i),
    ).toBeInTheDocument();
  });

  it("mounts LanguagePreference on Account", () => {
    render(<SettingsPage />);
    expect(screen.getByTestId("language-preference")).toBeInTheDocument();
  });

  it("mounts LayoutTemplatePreference on Preferences", () => {
    mockSearchTab = "preferences";
    render(<SettingsPage />);
    expect(
      screen.getByTestId("layout-template-preference"),
    ).toBeInTheDocument();
  });

  it("labels theme buttons and exposes the selected theme", () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole("button", {
        name: /settings\.themeLight|Light/i,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", {
        name: /settings\.themeDark|Dark/i,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", {
        name: /settings\.themeSystem|System/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("applies dark theme on dark button click", () => {
    render(<SettingsPage />);
    const darkButton = screen.getByRole("button", {
      name: /settings\.themeDark|Dark/i,
    });
    fireEvent.click(darkButton);
    expect(localStorage.setItem).toHaveBeenCalledWith("theme", "dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(darkButton).toHaveAttribute("aria-pressed", "true");
  });

  it("applies light theme on light button click", () => {
    render(<SettingsPage />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /settings\.themeLight|Light/i,
      }),
    );
    expect(localStorage.setItem).toHaveBeenCalledWith("theme", "light");
  });

  it("removes theme from localStorage on system button click", () => {
    render(<SettingsPage />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /settings\.themeSystem|System/i,
      }),
    );
    expect(localStorage.removeItem).toHaveBeenCalledWith("theme");
  });

  it("syncs auto-lock timeout to vault crypto service on mount", () => {
    render(<SettingsPage />);
    expect(mockSetAutoLockTimeout).toHaveBeenCalledWith(900000);
  });

  it("saves profile name via tRPC on form submit", async () => {
    mockTrpcMutation.mockResolvedValue({ name: "New Name" });
    render(<SettingsPage />);

    const nameInput = screen.getByDisplayValue("Test User");
    fireEvent.change(nameInput, { target: { value: "New Name" } });

    fireEvent.click(
      screen.getByRole("button", {
        name: /settings\.saveProfile|Save changes/i,
      }),
    );

    await waitFor(() => {
      expect(mockTrpcMutation).toHaveBeenCalledWith("user", "updateProfile", {
        name: "New Name",
      });
    });
  });

  it("shows user initials in avatar", () => {
    render(<SettingsPage />);
    expect(screen.getByText("TU")).toBeInTheDocument();
  });

  it("disables email input", () => {
    render(<SettingsPage />);
    expect(screen.getByDisplayValue("test@example.com")).toBeDisabled();
  });

  it("disables save button when form is clean", () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole("button", {
        name: /settings\.saveProfile|Save changes/i,
      }),
    ).toBeDisabled();
  });

  // ── Tabs and responsive navigation ──────────────────────────────

  it("removes missing and invalid tab queries so the page defaults to Account", () => {
    const validateSearch = (
      Route as unknown as {
        validateSearch: (search: Record<string, unknown>) => { tab?: string };
      }
    ).validateSearch;

    expect(validateSearch({})).toEqual({});
    expect(validateSearch({ tab: "unknown" })).toEqual({});
  });

  it("renders the ungated tabs in order and only mounts Account by default", () => {
    render(<SettingsPage />);

    const tabList = screen.getByRole("tablist", { name: "settings.title" });
    expect(tabList).toHaveClass("h-auto", "overflow-x-auto");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "settings.sections.account.title",
      "settings.sections.security.title",
      "settings.sections.devices.title",
      "settings.sections.data.title",
      "settings.sections.preferences.title",
    ]);
    expect(
      screen.getByRole("tab", {
        name: "settings.sections.account.title",
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(document.querySelector("#section-account")).not.toBeNull();
    expect(document.querySelector("#section-security")).toBeNull();
  });

  it("reveals a deep-linked active tab in the scrolling tab list", () => {
    mockSearchTab = "preferences";
    render(<SettingsPage />);

    expect(
      screen.getByRole("tab", {
        name: "settings.sections.preferences.title",
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(mockScrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
  });

  it("stores tab changes in the URL with replace", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(
      screen.getByRole("tab", {
        name: "settings.sections.security.title",
      }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/dashboard/settings",
      search: { tab: "security" },
      replace: true,
    });
  });

  it.each([
    {
      tab: "security",
      label: "settings.sections.security.title",
      section: "section-security",
      marker: '[data-tour="settings-security"]',
      cta: /settings\.sections\.security\.cta/i,
      href: "/dashboard/settings/security",
    },
    {
      tab: "data",
      label: "settings.sections.data.title",
      section: "section-data",
      marker: '[data-tour="settings-data"]',
      cta: /settings\.sections\.data\.cta/i,
      href: "/dashboard/settings/import-export",
    },
  ])(
    "deep-links to $tab and renders its CTA as one responsive link",
    ({ tab, label, section, marker, cta, href }) => {
      mockSearchTab = tab;
      render(<SettingsPage />);

      expect(screen.getByRole("tab", { name: label })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(document.querySelector(`#${section}`)).not.toBeNull();
      expect(document.querySelector("#section-account")).toBeNull();
      expect(document.querySelector(marker)).not.toBeNull();

      const link = screen.getByRole("link", { name: cta });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveClass("w-full", "sm:w-auto", "whitespace-normal");
      expect(screen.queryByRole("button", { name: cta })).toBeNull();
    },
  );

  it("associates the Security selects with visible labels", () => {
    mockSearchTab = "security";
    render(<SettingsPage />);

    expect(
      screen.getByRole("combobox", {
        name: /settings\.persistentUnlock/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", {
        name: /settings\.inactivityLock/i,
      }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-tour="unlock-remember"]'),
    ).not.toBeNull();
  });

  it("adds accessible attention text to Devices when enrollment is deferred", async () => {
    mockIsEnrollmentDeferred.mockReturnValue(true);
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("tab", {
          name: /settings\.sections\.devices\.enrollment\.title/i,
        }),
      ).toBeInTheDocument();
    });
  });
});
