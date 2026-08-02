// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Floating "Guide me" launcher + first-run nudge.
 * Positioned above the mobile BottomNav via `env(safe-area-inset-bottom)`.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleHelp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDraggable } from "../hooks/useDraggable";
import { hasSeenNudge, markNudgeSeen } from "../lib/progressStorage";
import { useGuide } from "../GuideProvider";

const isTypingTarget = (element: EventTarget | null): boolean =>
  element instanceof HTMLElement &&
  (element.tagName === "INPUT" || element.tagName === "TEXTAREA");

export const GuideLauncher = () => {
  const { t } = useTranslation("guide");
  const { dispatch } = useGuide();
  const [nudgeVisible, setNudgeVisible] = useState(() => !hasSeenNudge());

  const dismissNudge = (): void => {
    markNudgeSeen();
    setNudgeVisible(false);
  };

  const activate = (): void => {
    if (nudgeVisible) dismissNudge();
    dispatch({ type: "openPanel" });
  };

  const { position, dragging, handlers } = useDraggable(activate);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "?" && event.shiftKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        dispatch({ type: "openPanel" });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);

  // Keep clear of the mobile BottomNav + its safe-area inset.
  const inlineInset =
    position.side === "end"
      ? { insetInlineEnd: "0.75rem" }
      : { insetInlineStart: "0.75rem" };

  const topWithSafeArea = `calc(min(${position.y}px, 100dvh - 5rem - env(safe-area-inset-bottom)))`;

  return (
    <>
      <button
        type="button"
        data-guide-launcher
        data-testid="guide-launcher"
        aria-label={t("launcher.ariaLabel")}
        title={t("launcher.tooltip")}
        onPointerDown={handlers.onPointerDown}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        className={`fixed z-[45] flex size-11 touch-none items-center justify-center rounded-lg border bg-background text-foreground transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ top: topWithSafeArea, ...inlineInset }}
      >
        <CircleHelp className="size-5" aria-hidden="true" />
      </button>
      {nudgeVisible ? (
        <div
          role="status"
          data-testid="guide-nudge"
          className="fixed z-[45] w-56 rounded-lg border bg-background p-3"
          style={{
            top: topWithSafeArea,
            ...(position.side === "end"
              ? { insetInlineEnd: "4.25rem" }
              : { insetInlineStart: "4.25rem" }),
          }}
        >
          <p className="pe-6 text-sm text-foreground">{t("nudge.text")}</p>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-sm"
            onClick={activate}
          >
            {t("nudge.cta")}
          </Button>
          <button
            type="button"
            aria-label={t("nudge.dismiss")}
            onClick={dismissNudge}
            className="absolute end-2 top-2 rounded-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
};
