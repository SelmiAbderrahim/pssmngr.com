// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Slide-in tour list panel.
 * Uses TanStack Router (this repo) rather than react-router-dom (source).
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { loadProgress } from "../lib/progressStorage";
import { parseStepRoute } from "../lib/stepRoute";
import { sortToursForRoute } from "../tours";
import type { TourDefinition, TourStep } from "../types";
import { useGuide } from "../GuideProvider";

export const GuidePanel = () => {
  const { t } = useTranslation("guide");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { state, dispatch, setEnabled } = useGuide();

  // Re-read persisted progress each time the panel opens.
  const [progress, setProgress] = useState(loadProgress);
  useEffect(() => {
    if (state.panelOpen) setProgress(loadProgress());
  }, [state.panelOpen]);
  const tours = useMemo(
    () => sortToursForRoute(pathname, progress.completed),
    [pathname, progress],
  );

  const resumeFor = (tour: TourDefinition) =>
    progress.resume && progress.resume.tourId === tour.id
      ? progress.resume
      : null;

  const start = (tour: TourDefinition): void => {
    const resume = resumeFor(tour);
    const stepIndex = resume
      ? Math.min(resume.stepIndex, tour.steps.length - 1)
      : 0;
    dispatch({ type: "startTour", tourId: tour.id, stepIndex });
    const route = (tour.steps[stepIndex] as TourStep).route;
    if (route) void navigate(parseStepRoute(route));
  };

  const rtl = typeof document !== "undefined" && document.dir === "rtl";
  const side: "bottom" | "left" | "right" = isMobile
    ? "bottom"
    : rtl
      ? "left"
      : "right";

  return (
    <Sheet
      open={state.panelOpen}
      onOpenChange={() => dispatch({ type: "closePanel" })}
    >
      <SheetContent side={side} className="max-h-dvh overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("panel.title")}</SheetTitle>
          <SheetDescription>
            {t("panel.progress", {
              done: progress.completed.length,
              total: tours.length,
            })}
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col gap-3 px-4">
          {tours.map((tour) => {
            const completed = progress.completed.includes(tour.id);
            const here = pathname.startsWith(tour.routePrefix);
            const resume = resumeFor(tour);
            return (
              <li
                key={tour.id}
                data-testid={`guide-tour-${tour.id}`}
                className="rounded-lg border bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {t(tour.titleKey)}
                  </span>
                  {completed ? (
                    <CircleCheck
                      className="size-4 text-emerald-500"
                      aria-label={t("panel.completed")}
                    />
                  ) : null}
                  {here ? (
                    <Badge variant="outline">{t("panel.youAreHere")}</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(tour.descriptionKey)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 min-h-[44px]"
                  onClick={() => start(tour)}
                >
                  {resume
                    ? t("panel.resume", { step: resume.stepIndex + 1 })
                    : completed
                      ? t("panel.replay")
                      : t("panel.start")}
                </Button>
              </li>
            );
          })}
        </ul>
        <SheetFooter>
          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <Label htmlFor="guide-me-panel-switch" className="text-sm">
              {t("toggle.label")}
            </Label>
            <Switch
              id="guide-me-panel-switch"
              checked={state.enabled}
              disabled={state.saving}
              onCheckedChange={(checked) => setEnabled(checked)}
            />
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
