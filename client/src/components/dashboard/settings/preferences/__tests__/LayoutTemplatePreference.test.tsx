// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * LayoutTemplatePreference Unit Tests
 *
 * Verifies the three template tiles render and selecting one calls
 * changeTemplate with the right id.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayoutTemplatePreference } from "../LayoutTemplatePreference";

const changeTemplate = vi.fn();
const ctx = {
  template: "default" as "default" | "compact" | "list",
  templateConfig: { viewMode: "grid", labelKey: "x", descKey: "y", densityClass: "tpl-default" },
  changeTemplate,
  isSaving: false,
};

vi.mock("@/providers/LayoutTemplateProvider", () => ({
  useLayoutTemplate: () => ctx,
}));

describe("LayoutTemplatePreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.template = "default";
    ctx.isSaving = false;
  });

  it("renders all three template radio options", () => {
    render(<LayoutTemplatePreference />);
    expect(screen.getByRole("radio", { name: /default/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /compact/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /list/i })).toBeInTheDocument();
  });

  it("marks the active template as checked", () => {
    ctx.template = "compact";
    render(<LayoutTemplatePreference />);
    expect(screen.getByRole("radio", { name: /compact/i })).toBeChecked();
  });

  it("calls changeTemplate when a different option is selected", async () => {
    const user = userEvent.setup();
    render(<LayoutTemplatePreference />);
    await user.click(screen.getByRole("radio", { name: /list/i }));
    expect(changeTemplate).toHaveBeenCalledWith("list");
  });
});
