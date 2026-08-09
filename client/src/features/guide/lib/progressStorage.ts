// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Persistent tour progress + first-run nudge flag.
 *
 * Persists guided-tour progress locally. Storage keys are stable and must not
 * be renamed without a migration.
 */

import type { TourProgress, TourResume } from "../types";

const PROGRESS_KEY = "guide:progress";
const NUDGE_KEY = "guide:nudge-seen";

const emptyProgress = (): TourProgress => ({ completed: [], resume: null });

const readRaw = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeRaw = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, quota) — progress becomes session-only.
  }
};

export const loadProgress = (): TourProgress => {
  const raw = readRaw(PROGRESS_KEY);
  if (!raw) return emptyProgress();
  try {
    const parsed = JSON.parse(raw) as Partial<TourProgress>;
    return {
      completed: Array.isArray(parsed.completed)
        ? parsed.completed.filter((id): id is string => typeof id === "string")
        : [],
      resume:
        parsed.resume && typeof parsed.resume.tourId === "string"
          ? {
              tourId: parsed.resume.tourId,
              stepIndex: Number(parsed.resume.stepIndex) || 0,
            }
          : null,
    };
  } catch {
    return emptyProgress();
  }
};

const saveProgress = (progress: TourProgress): void => {
  writeRaw(PROGRESS_KEY, JSON.stringify(progress));
};

export const isCompleted = (tourId: string): boolean =>
  loadProgress().completed.includes(tourId);

export const markCompleted = (tourId: string): void => {
  const progress = loadProgress();
  const completed = progress.completed.includes(tourId)
    ? progress.completed
    : [...progress.completed, tourId];
  const resume =
    progress.resume?.tourId === tourId ? null : progress.resume;
  saveProgress({ completed, resume });
};

export const saveResume = (resume: TourResume): void => {
  saveProgress({ ...loadProgress(), resume });
};

export const clearResume = (): void => {
  saveProgress({ ...loadProgress(), resume: null });
};

export const hasSeenNudge = (): boolean => readRaw(NUDGE_KEY) === "1";

export const markNudgeSeen = (): void => {
  writeRaw(NUDGE_KEY, "1");
};
