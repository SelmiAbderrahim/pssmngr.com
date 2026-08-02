// Copyright (c) 2026 Password Manager contributors
import { createFileRoute, redirect } from "@tanstack/react-router";

// Family is part of People (organization); this path remains for
// bookmarks and mobile deep links.
export const Route = createFileRoute("/_app/_auth/dashboard/family")({
	beforeLoad: () => {
		throw redirect({
			to: "/dashboard/organization",
			search: { tab: "family" },
			replace: true,
		});
	},
});
