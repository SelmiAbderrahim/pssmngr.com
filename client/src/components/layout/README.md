# Layout components

This directory contains pssmngr's authenticated browser shell.

- `MainLayout.tsx` composes the desktop and responsive layouts.
- `AppNavbar.tsx` and `AppSidebar.tsx` provide desktop navigation.
- `mobile-shell/` contains the responsive browser navigation; it is not a
  native-mobile application.
- `WorkspaceSwitcher.tsx` and `workspace-switcher/` handle active-organization
  selection.
- `NotificationBell.tsx` renders in-app notifications.

Navigation destinations belong in `navigation.ts` and `nav-items.ts` so desktop
and narrow-screen layouts remain in sync. Use logical CSS properties (`start`,
`end`, `ms`, `me`, `ps`, `pe`) to preserve Arabic RTL behavior.
