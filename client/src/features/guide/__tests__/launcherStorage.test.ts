// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampLauncherY,
  defaultLauncherPosition,
  loadLauncherPosition,
  saveLauncherPosition,
} from "../lib/launcherStorage";

function installMemoryStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  } as unknown as Storage);
}

describe("launcherStorage", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  describe("clampLauncherY", () => {
    it("clamps below 16", () => {
      expect(clampLauncherY(-10, 800)).toBe(16);
    });
    it("clamps above viewportHeight - 72", () => {
      expect(clampLauncherY(1000, 800)).toBe(728);
    });
    it("passes values in range", () => {
      expect(clampLauncherY(300, 800)).toBe(300);
    });
    it("handles a tiny viewport", () => {
      expect(clampLauncherY(50, 20)).toBe(16);
    });
  });

  describe("defaultLauncherPosition", () => {
    it("centers around 60% of the viewport, side 'end'", () => {
      const p = defaultLauncherPosition(1000);
      expect(p.side).toBe("end");
      expect(p.y).toBeGreaterThan(500);
    });
  });

  describe("load / save", () => {
    it("returns default when nothing stored", () => {
      expect(loadLauncherPosition(1000).side).toBe("end");
    });

    it("round-trips a saved position", () => {
      saveLauncherPosition({ y: 300, side: "start" });
      expect(loadLauncherPosition(1000)).toEqual({ y: 300, side: "start" });
    });

    it("clamps a stored y beyond viewport", () => {
      saveLauncherPosition({ y: 9999, side: "end" });
      const loaded = loadLauncherPosition(800);
      expect(loaded.y).toBeLessThanOrEqual(728);
    });

    it("returns default on corrupt JSON", () => {
      window.localStorage.setItem("guide:launcher", "not json");
      expect(loadLauncherPosition(800).side).toBe("end");
    });

    it("returns default on wrong shape", () => {
      window.localStorage.setItem(
        "guide:launcher",
        JSON.stringify({ y: "x", side: "middle" }),
      );
      expect(loadLauncherPosition(800).side).toBe("end");
    });

    it("degrades on getItem throw", () => {
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      } as unknown as Storage);
      expect(loadLauncherPosition(800).side).toBe("end");
    });

    it("degrades on setItem throw", () => {
      vi.stubGlobal("localStorage", {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: () => {},
        clear: () => {},
      } as unknown as Storage);
      expect(() => saveLauncherPosition({ y: 200, side: "end" })).not.toThrow();
    });
  });
});
