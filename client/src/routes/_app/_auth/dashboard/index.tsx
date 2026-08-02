// Copyright (c) 2026 Password Manager contributors
import { createFileRoute, redirect } from "@tanstack/react-router";

// Vault is the dashboard landing surface. The old
// widgets moved: security score → `components/security/SecurityScoreBadge`
// (available for the Watchtower header strip), quick actions superseded by
// the global Generator + Vault add-item, recent items fold into the vault
// default sort.
export const Route = createFileRoute("/_app/_auth/dashboard/")({
	beforeLoad: () => {
		throw redirect({
			to: "/dashboard/vault",
			search: { tab: "items", filter: "all", sort: "modified", q: "", create: undefined },
			replace: true,
		});
	},
});
