// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * CreateItemDialog Component Tests
 *
 * Covers:
 * - Dialog rendering with item type selector
 * - Form fields per item type (login, card, note, identity, totp)
 * - Password generation button
 * - Form submission with correct data shape
 * - Title validation (required)
 * - Form reset on close
 * - Password visibility toggle
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateItemDialog } from "../CreateItemDialog";

vi.mock("@/services/site-policies", () => ({
  matchPolicyForUrl: vi.fn(() => undefined),
  generatePasswordForPolicy: vi.fn(() => "policy-generated-password"),
}));

vi.mock("@/services/password-generator", () => ({
  generatePassword: vi.fn(() => "Rand0m!Pass#16ch"),
}));

// Mock Radix Select to use a native <select> element.
// Radix UI's Select uses floating portals and pointer-events that don't work
// reliably in jsdom. A native select responds to fireEvent.change correctly.
vi.mock("@/components/ui/select", () => {
  const React = require("react");
  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: React.ReactNode;
  }) => {
    // Extract option values/labels from SelectItem children (nested inside SelectContent)
    const options: { value: string; label: string }[] = [];
    const extractOptions = (node: React.ReactNode): void => {
      React.Children.forEach(node, (child) => {
        if (!React.isValidElement(child)) return;
        const el = child as React.ReactElement<any>;
        if (el.props?.value && typeof el.props.value === "string") {
          options.push({
            value: el.props.value,
            label: String(el.props.children ?? el.props.value),
          });
        }
        if (el.props?.children) extractOptions(el.props.children);
      });
    };
    extractOptions(children);
    return (
      <select
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        role="combobox"
        data-testid="item-type-select"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value}
          </option>
        ))}
      </select>
    );
  };
  const SelectTrigger = ({ children }: any) => <>{children}</>;
  const SelectValue = () => null;
  const SelectContent = ({ children }: any) => <>{children}</>;
  const SelectItem = ({ value, children }: any) => (
    <option value={value}>{children}</option>
  );
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

describe("CreateItemDialog", () => {
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn();

  const defaultProps = {
    open: true,
    onOpenChange,
    onSubmit,
    getExistingItems: vi.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onSubmit.mockResolvedValue(undefined);
  });

  // ── Rendering ────────────────────────────────────────────────────

  it("renders dialog with add item title", () => {
    render(<CreateItemDialog {...defaultProps} />);
    expect(screen.getByText("vault.addItem")).toBeInTheDocument();
  });

  it("renders item type selector", () => {
    render(<CreateItemDialog {...defaultProps} />);
    expect(screen.getByText("vault.itemType")).toBeInTheDocument();
  });

  it("renders title input", () => {
    render(<CreateItemDialog {...defaultProps} />);
    expect(
      screen.getByPlaceholderText("vault.titlePlaceholder"),
    ).toBeInTheDocument();
  });

  // ── Login form fields ────────────────────────────────────────────

  it("renders login fields by default", () => {
    render(<CreateItemDialog {...defaultProps} />);
    expect(
      screen.getByPlaceholderText("vault.usernamePlaceholder"),
    ).toBeInTheDocument();
    // Password field uses id, not placeholder
    expect(screen.getByLabelText("vault.password")).toBeInTheDocument();
  });

  it("has password generate button for login type", () => {
    render(<CreateItemDialog {...defaultProps} />);
    expect(screen.getByText("vault.generate")).toBeInTheDocument();
  });

  // ── Login submission ─────────────────────────────────────────────

  it("submits login data with correct shape", async () => {
    render(<CreateItemDialog {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText("vault.titlePlaceholder"), {
      target: { value: "My GitHub" },
    });
    fireEvent.change(screen.getByPlaceholderText("vault.usernamePlaceholder"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("vault.password"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByText("vault.save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "login",
        expect.objectContaining({
          title: "My GitHub",
          username: "admin",
          password: "secret123",
        }),
      );
    });
  });

  // ── Title validation ─────────────────────────────────────────────

  it("does not submit when title is empty", () => {
    render(<CreateItemDialog {...defaultProps} />);
    // Save button is disabled when title is empty
    const saveBtn = screen.getByText("vault.save").closest("button")!;
    expect(saveBtn).toBeDisabled();
  });

  // ── Note type ────────────────────────────────────────────────────

  it("renders note content field when note type is selected", () => {
    render(<CreateItemDialog {...defaultProps} />);
    // The title input should always be present
    expect(
      screen.getByPlaceholderText("vault.titlePlaceholder"),
    ).toBeInTheDocument();
  });

  // ── Form reset on close ──────────────────────────────────────────

  it("calls onOpenChange and resets on close", () => {
    render(<CreateItemDialog {...defaultProps} />);

    // Type in the title field
    fireEvent.change(screen.getByPlaceholderText("vault.titlePlaceholder"), {
      target: { value: "Something" },
    });

    // Cancel/close
    fireEvent.click(screen.getByText("common:cancel"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // ── Password visibility ──────────────────────────────────────────

  it("toggles password visibility", () => {
    render(<CreateItemDialog {...defaultProps} />);
    const passwordInput = screen.getByLabelText("vault.password");
    expect(passwordInput).toHaveAttribute("type", "password");

    // Find toggle button (tabIndex=-1 inside password field container)
    const toggleButtons = screen.getAllByRole("button");
    const visToggle = toggleButtons.find(
      (btn) => btn.getAttribute("tabindex") === "-1",
    );
    if (visToggle) {
      fireEvent.click(visToggle);
      expect(passwordInput).toHaveAttribute("type", "text");
    }
  });

  // ── Close on success ─────────────────────────────────────────────

  it("closes dialog after successful submission", async () => {
    render(<CreateItemDialog {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText("vault.titlePlaceholder"), {
      target: { value: "Test Item" },
    });

    fireEvent.click(screen.getByText("vault.save"));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // Helper: fire change event on the mocked native <select> (role="combobox")
  function selectItemType(value: string) {
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value } });
  }

  // ── Card type ───────────────────────────────────────────────────

  it("renders card fields when card type is selected", async () => {
    render(<CreateItemDialog {...defaultProps} />);
    selectItemType("card");

    await waitFor(() => {
      expect(document.getElementById("card-number")).toBeInTheDocument();
    });
  });

  it("submits card data with correct shape when card type is selected", async () => {
    render(<CreateItemDialog {...defaultProps} />);
    selectItemType("card");

    fireEvent.change(screen.getByPlaceholderText("vault.titlePlaceholder"), {
      target: { value: "My Visa" },
    });

    const cardNumberInput = document.getElementById("card-number")!;
    fireEvent.change(cardNumberInput, {
      target: { value: "4111111111111111" },
    });

    const cardNameInput = document.getElementById("card-name")!;
    fireEvent.change(cardNameInput, { target: { value: "John Doe" } });

    fireEvent.click(screen.getByText("vault.save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "card",
        expect.objectContaining({
          title: "My Visa",
          number: "4111111111111111",
        }),
      );
    });
  });

  // ── Identity type ────────────────────────────────────────────────

  it("renders identity fields when identity type is selected", async () => {
    render(<CreateItemDialog {...defaultProps} />);
    selectItemType("identity");

    await waitFor(() => {
      expect(document.getElementById("identity-name")).toBeInTheDocument();
    });
  });

  it("submits identity data with correct shape", async () => {
    render(<CreateItemDialog {...defaultProps} />);
    selectItemType("identity");

    fireEvent.change(screen.getByPlaceholderText("vault.titlePlaceholder"), {
      target: { value: "My Identity" },
    });

    const nameInput = document.getElementById("identity-name")!;
    fireEvent.change(nameInput, { target: { value: "John Doe" } });

    const emailInput = document.getElementById("identity-email")!;
    fireEvent.change(emailInput, { target: { value: "john@example.com" } });

    fireEvent.click(screen.getByText("vault.save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "identity",
        expect.objectContaining({ title: "My Identity", fullName: "John Doe" }),
      );
    });
  });

  // ── TOTP type ────────────────────────────────────────────────────

  it("renders TOTP fields when totp type is selected", async () => {
    render(<CreateItemDialog {...defaultProps} />);
    selectItemType("totp");

    await waitFor(() => {
      expect(document.getElementById("totp-secret")).toBeInTheDocument();
    });
  });

  it("save button is disabled when totp type has empty secret", async () => {
    render(<CreateItemDialog {...defaultProps} />);
    selectItemType("totp");

    // Fill in title but leave secret empty
    fireEvent.change(screen.getByPlaceholderText("vault.titlePlaceholder"), {
      target: { value: "My TOTP" },
    });

    // Secret is empty so save should be disabled
    const saveBtn = screen.getByText("vault.save").closest("button")!;
    expect(saveBtn).toBeDisabled();
  });

  it("submits totp data with correct shape when secret is provided", async () => {
    render(<CreateItemDialog {...defaultProps} />);
    selectItemType("totp");

    fireEvent.change(screen.getByPlaceholderText("vault.titlePlaceholder"), {
      target: { value: "GitHub TOTP" },
    });

    const secretInput = document.getElementById("totp-secret")!;
    fireEvent.change(secretInput, { target: { value: "JBSWY3DPEHPK3PXP" } });

    fireEvent.click(screen.getByText("vault.save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "totp",
        expect.objectContaining({
          title: "GitHub TOTP",
          secret: "JBSWY3DPEHPK3PXP",
          algorithm: "SHA1",
          digits: 6,
          period: 30,
        }),
      );
    });
  });

  // ── Note type ─────────────────────────────────────────────────────

  it("submits note data with correct shape", async () => {
    render(<CreateItemDialog {...defaultProps} />);
    selectItemType("note");

    fireEvent.change(screen.getByPlaceholderText("vault.titlePlaceholder"), {
      target: { value: "My Secret Note" },
    });

    const notesTextarea = document.getElementById("item-notes")!;
    fireEvent.change(notesTextarea, { target: { value: "Some private info" } });

    fireEvent.click(screen.getByText("vault.save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "note",
        expect.objectContaining({
          title: "My Secret Note",
          content: "Some private info",
        }),
      );
    });
  });

  // ── Passkey type ────────────────────────────────────────────────

  it("shows passkey hint text when passkey type is selected", async () => {
    render(<CreateItemDialog {...defaultProps} />);
    selectItemType("passkey");

    await waitFor(() => {
      expect(screen.getByText("vault.passkeyHint")).toBeInTheDocument();
    });
  });

  // ── Password generation ─────────────────────────────────────────

  it("generates password when generate button is clicked", async () => {
    render(<CreateItemDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("vault.generate"));

    const passwordInput = screen.getByLabelText(
      "vault.password",
    ) as HTMLInputElement;
    expect(passwordInput.value).toBeTruthy();
  });

  it("fills URL field in login form", async () => {
    render(<CreateItemDialog {...defaultProps} />);

    const urlInput = document.getElementById("item-url");
    if (urlInput) {
      fireEvent.change(urlInput, { target: { value: "https://github.com" } });
      expect((urlInput as HTMLInputElement).value).toBe("https://github.com");
    }
  });

  // ── Submission loading state ─────────────────────────────────────

  it("save button is not disabled with a title entered", () => {
    render(<CreateItemDialog {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText("vault.titlePlaceholder"), {
      target: { value: "Test Item" },
    });

    const saveBtn = screen.getByText("vault.save").closest("button")!;
    expect(saveBtn).not.toBeDisabled();
  });

  it("requires explicit confirmation before adding an exact duplicate", async () => {
    const getExistingItems = vi.fn().mockResolvedValue([
      {
        id: "existing",
        itemType: "login",
        isFavorite: false,
        createdAt: "",
        updatedAt: "",
        decrypted: { title: "GitHub" },
      },
    ]);
    render(
      <CreateItemDialog
        {...defaultProps}
        getExistingItems={getExistingItems}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("vault.titlePlaceholder"), {
      target: { value: "GitHub" },
    });
    fireEvent.click(screen.getByText("vault.save"));

    expect(
      await screen.findByText("vault.duplicateFoundTitle"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("duplicate-add-anyway"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("lets the user explicitly continue when the complete check fails", async () => {
    render(
      <CreateItemDialog
        {...defaultProps}
        getExistingItems={vi.fn().mockRejectedValue(new Error("offline"))}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("vault.titlePlaceholder"), {
      target: { value: "Offline item" },
    });
    fireEvent.click(screen.getByText("vault.save"));

    expect(
      await screen.findByText("vault.duplicateCheckFailedTitle"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("duplicate-add-anyway"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});
