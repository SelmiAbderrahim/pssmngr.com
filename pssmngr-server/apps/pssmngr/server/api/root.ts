// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { createTRPCRouter } from "../api/trpc";
import { authRouter } from "./routers/auth";
import { credentialsRouter } from "./routers/credentials";
import { dataExportRouter } from "./routers/data-export";
import { deviceRouter } from "./routers/device";
import { emergencyRouter } from "./routers/emergency";
import { familyRouter } from "./routers/family";
import { notificationsRouter } from "./routers/notifications";
import { organizationRouter } from "./routers/organization";
import { passkeysRouter } from "./routers/passkeys";
import { serverRouter } from "./routers/server";
import { settingsRouter } from "./routers/settings";
import { sharedVaultRouter } from "./routers/shared-vault";
import { sharingRouter } from "./routers/sharing";
import { userRouter } from "./routers/user";
import { vaultRouter } from "./routers/vault";

export const appRouter = createTRPCRouter({
	auth: authRouter,
	credentials: credentialsRouter,
	dataExport: dataExportRouter,
	device: deviceRouter,
	emergency: emergencyRouter,
	family: familyRouter,
	notification: notificationsRouter,
	organization: organizationRouter,
	passkeys: passkeysRouter,
	server: serverRouter,
	settings: settingsRouter,
	sharedVault: sharedVaultRouter,
	sharing: sharingRouter,
	user: userRouter,
	vault: vaultRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
