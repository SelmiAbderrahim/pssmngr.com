// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { db } from "@pssmngr/server/db";
import { member, user } from "@pssmngr/server/db/schema";
import { eq } from "drizzle-orm";

(async () => {
	try {
		const owner = await db.query.member.findFirst({
			where: eq(member.role, "owner"),
			columns: { userId: true },
		});
		if (!owner) throw new Error("No organization owner found");

		const update = await db
			.update(user)
			.set({
				twoFactorEnabled: false,
			})
			.where(eq(user.id, owner.userId));

		if (update) {
			console.log("2FA reset successful");
		} else {
			console.log("Password reset failed");
		}

		process.exit(0);
	} catch (error) {
		console.log("Error resetting 2FA", error);
	}
})();
