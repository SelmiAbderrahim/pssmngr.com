// Copyright (c) 2026 Password Manager contributors
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_auth/dashboard/settings/profile")({
	beforeLoad: () => {
		throw redirect({ to: "/dashboard/settings", replace: true });
	},
});
