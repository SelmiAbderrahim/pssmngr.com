// Copyright (c) 2026 Password Manager contributors
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return <Outlet />;
}
