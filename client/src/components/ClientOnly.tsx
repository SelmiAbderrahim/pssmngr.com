// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders children only after mount.
 *
 * On the first (hydration) render it returns null so the client DOM matches the
 * server-prerendered DOM, then mounts its children immediately afterwards. Used
 * to keep browser-only, DOM-emitting widgets (toasts and devtools)
 * out of the hydration pass on prerendered routes.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : null;
}
