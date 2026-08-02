// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GeneratorPanel } from "../GeneratorPanel";

vi.mock("@/lib/clipboard", () => ({
	copySensitiveText: vi.fn(async () => {}),
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

const stableT = (_key: string, fallback?: string) => fallback ?? _key;
const stableTranslation = { t: stableT };
vi.mock("react-i18next", () => ({
	useTranslation: () => stableTranslation,
	initReactI18next: { type: "3rdParty", init: () => {} },
	Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
	I18nextProvider: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

describe("GeneratorPanel", () => {
	it("renders standalone with both tabs and a generated password", async () => {
		render(<GeneratorPanel />);
		expect(screen.getByRole("tab", { name: /Password/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /Passphrase/i })).toBeInTheDocument();
		const output = await screen.findByLabelText(/Generated password/i);
		expect(output.textContent?.length ?? 0).toBeGreaterThan(0);
	});

	it("switches to passphrase tab when clicked", async () => {
		render(<GeneratorPanel />);
		const user = userEvent.setup();
		await act(async () => {
			await user.click(screen.getByRole("tab", { name: /Passphrase/i }));
		});
		expect(await screen.findByLabelText(/Generated passphrase/i)).toBeInTheDocument();
	});

	it("honours initialTab prop", async () => {
		render(<GeneratorPanel initialTab="passphrase" />);
		expect(await screen.findByLabelText(/Generated passphrase/i)).toBeInTheDocument();
	});

	it("calls onUsePassword when provided and the Use button is clicked", async () => {
		const onUse = vi.fn();
		render(<GeneratorPanel onUsePassword={onUse} />);
		const user = userEvent.setup();
		const useBtn = await screen.findByRole("button", { name: /Use password/i });
		await act(async () => {
			await user.click(useBtn);
		});
		expect(onUse).toHaveBeenCalledWith(expect.any(String));
	});

	it("fires onTabChange when the user switches tabs", async () => {
		const onTabChange = vi.fn();
		render(<GeneratorPanel onTabChange={onTabChange} />);
		const user = userEvent.setup();
		await act(async () => {
			await user.click(screen.getByRole("tab", { name: /Passphrase/i }));
		});
		expect(onTabChange).toHaveBeenCalledWith("passphrase");
	});
});
