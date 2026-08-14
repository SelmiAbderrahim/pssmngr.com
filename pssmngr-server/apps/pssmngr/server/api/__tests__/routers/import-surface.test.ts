// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Import API surface regression.
 *
 * Bulk import is a client-side operation: the browser parses, encrypts, and
 * then submits ciphertext envelopes. These tests pin that contract so a
 * server-side parse route — or a plaintext field on the batch procedures —
 * cannot reappear unnoticed.
 */

import { describe, expect, it } from "vitest";
import { appRouter } from "../../root";

type ProcedureRecord = Record<string, unknown>;

function procedureNames(router: unknown): string[] {
	const record = (router as { _def?: { procedures?: ProcedureRecord } })._def
		?.procedures;
	return record ? Object.keys(record) : [];
}

const routerNames = Object.keys(
	(appRouter as unknown as { _def: { record: ProcedureRecord } })._def.record,
);

describe("import API surface", () => {
	it("exposes no AI import router", () => {
		for (const name of routerNames) {
			expect(name.toLowerCase()).not.toContain("ai");
		}
		expect(routerNames).not.toContain("aiImport");
	});

	it("exposes no parse procedure on any router", () => {
		const record = (
			appRouter as unknown as { _def: { record: Record<string, unknown> } }
		)._def.record;

		for (const [routerName, router] of Object.entries(record)) {
			for (const procedure of procedureNames(router)) {
				expect(
					`${routerName}.${procedure}`.toLowerCase(),
					`${routerName}.${procedure} looks like a server-side parse route`,
				).not.toMatch(/\b(parse|extract|analyze|analyse)\b/);
			}
		}
	});

	it("keeps a bulk item write on both vault kinds", () => {
		expect(procedureNames(appRouter.credentials)).toContain("batchCreate");
		expect(procedureNames(appRouter.sharedVault)).toContain("batchAddItems");
	});

	it("accepts only ciphertext envelopes and non-secret ids on both batches", () => {
		const forbidden = [
			"title",
			"username",
			"password",
			"url",
			"uri",
			"notes",
			"note",
			"totp",
			"secret",
			"data",
			"plaintext",
			"content",
			"text",
			"prompt",
		];

		const cases = [
			{
				label: "credentials.batchCreate",
				input: {
					vaultId: "v-1",
					items: [
						{
							itemType: "login",
							ciphertext: "ct",
							nonce: "n",
							authTag: "a",
							wrappedDataKey: "k",
							wrappedDataKeyNonce: "kn",
							wrappedDataKeyAuthTag: "kt",
						},
					],
				},
				parse: (value: unknown) =>
					(
						appRouter.credentials._def.procedures.batchCreate as unknown as {
							_def: { inputs: Array<{ parse: (v: unknown) => unknown }> };
						}
					)._def.inputs[0]!.parse(value),
			},
			{
				label: "sharedVault.batchAddItems",
				input: {
					vaultId: "v-1",
					items: [
						{
							itemType: "login",
							ciphertext: "ct",
							nonce: "n",
							authTag: "a",
							wrappedDataKey: "k",
							wrappedDataKeyNonce: "kn",
							wrappedDataKeyAuthTag: "kt",
						},
					],
				},
				parse: (value: unknown) =>
					(
						appRouter.sharedVault._def.procedures.batchAddItems as unknown as {
							_def: { inputs: Array<{ parse: (v: unknown) => unknown }> };
						}
					)._def.inputs[0]!.parse(value),
			},
		];

		for (const { label, input, parse } of cases) {
			// The baseline ciphertext payload is accepted.
			expect(() => parse(input), label).not.toThrow();

			for (const key of forbidden) {
				expect(
					() => parse({ ...input, [key]: "leak" }),
					`${label} accepted a top-level "${key}"`,
				).toThrow();

				expect(
					() =>
						parse({
							...input,
							items: [{ ...(input.items[0] as object), [key]: "leak" }],
						}),
					`${label} accepted an item-level "${key}"`,
				).toThrow();
			}
		}
	});
});
