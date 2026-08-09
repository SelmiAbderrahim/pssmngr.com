// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Resolve a `[data-tour="<target>"]` DOM anchor for the guided tour.
 *
 * Waits with MutationObserver, respects
 * `prefers-reduced-motion`, and detects mid-step removal via `isConnected`.
 */

import { useEffect, useState } from "react";
import type { Rect } from "../lib/positioning";
import type { TargetStatus } from "../types";

export const ANCHOR_TIMEOUT_MS = 5000;

export interface AnchorState {
  status: TargetStatus;
  rect: Rect | null;
}

const toRect = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

const prefersReducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const useAnchor = (target: string, active: boolean): AnchorState => {
  const [state, setState] = useState<AnchorState>({
    status: "searching",
    rect: null,
  });

  useEffect(() => {
    if (!active) {
      setState({ status: "searching", rect: null });
      return;
    }

    setState({ status: "searching", rect: null });
    const selector = `[data-tour="${target}"]`;
    let cancelWaiting: (() => void) | null = null;
    let detachTracking: (() => void) | null = null;

    const attach = (found: Element): void => {
      const update = (): void => {
        if (!found.isConnected) {
          setState({ status: "missing", rect: null });
          return;
        }
        setState({ status: "found", rect: toRect(found) });
      };
      found.scrollIntoView({
        block: "center",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      update();
      window.addEventListener("scroll", update, true);
      window.addEventListener("resize", update);
      detachTracking = () => {
        window.removeEventListener("scroll", update, true);
        window.removeEventListener("resize", update);
      };
    };

    const existing = document.querySelector(selector);
    if (existing) {
      attach(existing);
    } else {
      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (!found) return;
        observer.disconnect();
        clearTimeout(timeoutId);
        attach(found);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        setState({ status: "missing", rect: null });
      }, ANCHOR_TIMEOUT_MS);
      cancelWaiting = () => {
        observer.disconnect();
        clearTimeout(timeoutId);
      };
    }

    return () => {
      cancelWaiting?.();
      detachTracking?.();
    };
  }, [target, active]);

  return state;
};
