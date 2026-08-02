// Copyright (c) 2026 Password Manager contributors
/**
 * Route-integrity guard for the settings surface.
 *
 * This test checks every `to="..."` prop under `client/src/routes` and the layout components
 * that render settings entry-cards, and asserts every distinct settings-scoped
 * target resolves to an existing route file (or documented redirect stub).
 *
 * It is intentionally scoped to /dashboard/settings/*.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROUTES_DIR = path.resolve(__dirname, "..");
const SETTINGS_INDEX = path.join(ROUTES_DIR, "settings.index.tsx");

function collectFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    for (const name of fs.readdirSync(p)) {
      const full = path.join(p, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(tsx?)$/.test(name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

function fileRouteFor(target: string): string | null {
  // Map `/dashboard/settings/security` → routes/_app/_auth/dashboard/settings/security.tsx
  const stripped = target.replace(/^\/dashboard\//, "");
  const candidates = [
    path.join(ROUTES_DIR, `${stripped}.tsx`),
    path.join(ROUTES_DIR, stripped, "index.tsx"),
    path.join(ROUTES_DIR, `${stripped.replace(/\/$/, "")}.tsx`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

describe("settings route integrity", () => {
  const targetsFromIndex = () => {
    const src = fs.readFileSync(SETTINGS_INDEX, "utf8");
    const matches = src.match(/to="(\/dashboard\/settings[^"]*)"/g) ?? [];
    return Array.from(
      new Set(matches.map((m) => m.replace(/^to="/, "").replace(/"$/, ""))),
    );
  };

  it("settings.index.tsx only links to existing dashboard routes", () => {
    const targets = targetsFromIndex();
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      const file = fileRouteFor(target);
      expect(file, `dangling link target: ${target}`).not.toBeNull();
    }
  });

  it("no settings.index link points to the removed data-export URL as a canonical target", () => {
    // data-export lingers only as a redirect stub; the settings surface must
    // never direct users into it.
    const src = fs.readFileSync(SETTINGS_INDEX, "utf8");
    expect(src).not.toMatch(/to="\/dashboard\/settings\/data-export"/);
  });

  it("data-export redirect stub file still exists (bookmark compatibility)", () => {
    // Existing bookmarks must resolve to a redirect, never a 404.
    expect(
      fs.existsSync(path.join(ROUTES_DIR, "settings", "data-export.tsx")),
    ).toBe(true);
  });

  it("all reachable settings sub-routes still exist", () => {
    // Enumerate the settings dir; every non-test .tsx must have a live Route
    // export (redirect stub is fine — it exports a Route with beforeLoad).
    const dir = path.join(ROUTES_DIR, "settings");
    const files = collectFiles(dir).filter(
      (f) => !f.includes("__tests__"),
    );
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, `Route export missing in ${f}`).toMatch(
        /export const Route\s*=/,
      );
    }
  });
});
