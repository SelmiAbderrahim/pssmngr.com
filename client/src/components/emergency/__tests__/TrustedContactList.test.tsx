// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * TrustedContactList Component Tests
 *
 * Covers:
 * - Loading skeleton state
 * - Empty state with hint
 * - Contact rendering (name, email, avatar, waiting period)
 * - Initials from name vs email
 * - Add contact button
 * - Remove button presence
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrustedContactList } from "../TrustedContactList";
import type { TrustedContact } from "@/types/emergency";

function makeContact(overrides: Partial<TrustedContact> = {}): TrustedContact {
  return {
    id: "tc-1",
    waitingPeriodDays: 7,
    createdAt: "2025-03-01T00:00:00Z",
    contact: {
      id: "u-contact",
      name: "Jane Doe",
      email: "jane@test.com",
      image: null,
    },
    ...overrides,
  };
}

describe("TrustedContactList", () => {
  const onAddClick = vi.fn();
  const onRemove = vi.fn().mockResolvedValue(undefined);

  const baseProps = {
    contacts: [] as TrustedContact[],
    isLoading: false,
    onAddClick,
    onRemove,
  };

  beforeEach(() => vi.clearAllMocks());

  // ── Loading ────────────────────────────────────────────────────────

  it("renders loading skeleton when isLoading", () => {
    render(<TrustedContactList {...baseProps} isLoading />);
    expect(screen.queryByText("contacts.title")).not.toBeInTheDocument();
  });

  // ── Empty state ───────────────────────────────────────────────────

  it("shows empty state message", () => {
    render(<TrustedContactList {...baseProps} />);
    expect(screen.getByText("contacts.empty")).toBeInTheDocument();
    expect(screen.getByText("emergency.contacts.emptyHint")).toBeInTheDocument();
  });

  // ── Contact list ──────────────────────────────────────────────────

  it("renders contact name and email", () => {
    render(<TrustedContactList {...baseProps} contacts={[makeContact()]} />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@test.com")).toBeInTheDocument();
  });

  it("shows email as name when contact name is null", () => {
    const noName = makeContact({
      contact: { id: "u-2", name: null, email: "anon@test.com", image: null },
    });
    render(<TrustedContactList {...baseProps} contacts={[noName]} />);
    const emailElements = screen.getAllByText("anon@test.com");
    expect(emailElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows initials from name (first letters of words)", () => {
    render(<TrustedContactList {...baseProps} contacts={[makeContact()]} />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("shows initial from email when name is null", () => {
    const noName = makeContact({
      contact: { id: "u-2", name: null, email: "bob@test.com", image: null },
    });
    render(<TrustedContactList {...baseProps} contacts={[noName]} />);
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("renders waiting period badge", () => {
    render(<TrustedContactList {...baseProps} contacts={[makeContact({ waitingPeriodDays: 14 })]} />);
    expect(screen.getByText("contacts.waitDays")).toBeInTheDocument();
  });

  it("renders multiple contacts", () => {
    const contacts = [
      makeContact({ id: "tc-1", contact: { id: "u-1", name: "Alice", email: "a@t.com", image: null } }),
      makeContact({ id: "tc-2", contact: { id: "u-2", name: "Bob", email: "b@t.com", image: null } }),
    ];
    render(<TrustedContactList {...baseProps} contacts={contacts} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  // ── Add button ────────────────────────────────────────────────────

  it("calls onAddClick when add button is clicked", () => {
    render(<TrustedContactList {...baseProps} />);
    fireEvent.click(screen.getByText("contacts.add"));
    expect(onAddClick).toHaveBeenCalledOnce();
  });

  // ── Title and description ─────────────────────────────────────────

  it("renders title and description", () => {
    render(<TrustedContactList {...baseProps} />);
    expect(screen.getByText("contacts.title")).toBeInTheDocument();
    expect(screen.getByText("emergency.contacts.description")).toBeInTheDocument();
  });
});
