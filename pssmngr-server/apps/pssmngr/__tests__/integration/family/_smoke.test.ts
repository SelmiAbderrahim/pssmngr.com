// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { familyRouter } from "../../../server/api/routers/family";
import { createUser, makeCtx, testSetup } from "./setup";

describe("smoke: harness wiring", () => {
	beforeAll(testSetup.beforeAll);
	afterAll(testSetup.afterAll);
	beforeEach(testSetup.beforeEach);

	it("creates a user and a family against the real DB", async () => {
		const organizer = await createUser({ name: "Organizer" });
		const caller = familyRouter.createCaller(makeCtx(organizer));

		const fam = await caller.create({ name: "Smoke Family" });
		expect(fam.id).toBeTruthy();
		expect(fam.name).toBe("Smoke Family");

		const got = await caller.get();
		expect(got.memberCount).toBe(1);
		expect(got.role).toBe("owner");
	});
});
