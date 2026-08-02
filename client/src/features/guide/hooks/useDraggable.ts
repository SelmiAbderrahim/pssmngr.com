// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Draggable launcher with edge-snap + click detection.
 *
 * Pointer-driven dragging for the guided-tour launcher.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import {
  clampLauncherY,
  loadLauncherPosition,
  saveLauncherPosition,
} from "../lib/launcherStorage";
import type { LauncherPosition } from "../types";

/** Pointer travel below this many pixels counts as a click, not a drag. */
const DRAG_THRESHOLD = 5;

export interface DraggableHandlers {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
}

export interface UseDraggableResult {
  position: LauncherPosition;
  dragging: boolean;
  handlers: DraggableHandlers;
}

export const useDraggable = (onActivate: () => void): UseDraggableResult => {
  const [position, setPosition] = useState<LauncherPosition>(() =>
    loadLauncherPosition(window.innerHeight),
  );
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, y: 0, originY: 0, moved: false, active: false });

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = {
        x: event.clientX,
        y: event.clientY,
        originY: position.y,
        moved: false,
        active: true,
      };
    },
    [position.y],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!start.current.active) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (!start.current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      start.current.moved = true;
      setDragging(true);
      setPosition((prev) => ({
        ...prev,
        y: clampLauncherY(start.current.originY + dy, window.innerHeight),
      }));
    },
    [],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!start.current.active) return;
      start.current.active = false;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDragging(false);
      if (!start.current.moved) {
        onActivate();
        return;
      }
      const physicalEnd = event.clientX > window.innerWidth / 2;
      const rtl = document.dir === "rtl";
      const side: LauncherPosition["side"] =
        physicalEnd !== rtl ? "end" : "start";
      setPosition((prev) => {
        const next = { ...prev, side };
        saveLauncherPosition(next);
        return next;
      });
    },
    [onActivate],
  );

  useEffect(() => {
    const onResize = (): void => {
      setPosition((prev) => ({
        ...prev,
        y: clampLauncherY(prev.y, window.innerHeight),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    position,
    dragging,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  };
};
