// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * GuideProvider — reducer and context for guided-tour state.
 *
 * Reason to replace (R2 exception): this repo has no Redux. The reducer
 * mirrors the RTK slice's state shape so the ported slice tests translate
 * 1:1 into reducer tests, and the pending/fulfilled/rejected contract used
 * by the ported thunk becomes an optimistic TanStack Query mutation here.
 *
 * Server sync: `enabled` mirrors the DB-backed `user.guideMe` preference
 * (default true). Toggling optimistically updates the reducer, then rolls
 * back on mutation error. Disabling tears down any active tour (that
 * reducer rule is ported verbatim from `slice.ts`).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcMutation, trpcQuery } from "@/lib/api/trpc";
import { useAuthState } from "@/providers/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import type { GuideState, TourDefinition, TourStep } from "./types";
import { findTour } from "./tours";

// ─── State shape (identical to the RTK slice) ───────────────────────────────

const initialState: GuideState = {
  enabled: true,
  saving: false,
  error: null,
  panelOpen: false,
  activeTourId: null,
  stepIndex: 0,
};

// ─── Actions ────────────────────────────────────────────────────────────────

export type GuideAction =
  | { type: "openPanel" }
  | { type: "closePanel" }
  | { type: "startTour"; tourId: string; stepIndex?: number }
  | { type: "nextStep" }
  | { type: "prevStep" }
  | { type: "endTour" }
  | { type: "hydrateEnabled"; value: boolean }
  | { type: "setEnabled.pending"; value: boolean }
  | { type: "setEnabled.fulfilled"; value: boolean }
  | { type: "setEnabled.rejected"; prev: boolean; error: string };

// ─── Reducer ────────────────────────────────────────────────────────────────

export const guideReducer = (
  state: GuideState,
  action: GuideAction,
): GuideState => {
  switch (action.type) {
    case "openPanel":
      return { ...state, panelOpen: true, error: null };
    case "closePanel":
      return { ...state, panelOpen: false };
    case "startTour":
      return {
        ...state,
        panelOpen: false,
        activeTourId: action.tourId,
        stepIndex: action.stepIndex ?? 0,
      };
    case "nextStep":
      return { ...state, stepIndex: state.stepIndex + 1 };
    case "prevStep":
      return { ...state, stepIndex: Math.max(0, state.stepIndex - 1) };
    case "endTour":
      return { ...state, activeTourId: null, stepIndex: 0 };
    case "hydrateEnabled":
      return { ...state, enabled: action.value };
    case "setEnabled.pending":
      // Optimistic: flip enabled immediately, teardown if disabling.
      return {
        ...state,
        saving: true,
        error: null,
        enabled: action.value,
        panelOpen: action.value ? state.panelOpen : false,
        activeTourId: action.value ? state.activeTourId : null,
        stepIndex: action.value ? state.stepIndex : 0,
      };
    case "setEnabled.fulfilled":
      return { ...state, saving: false, enabled: action.value };
    case "setEnabled.rejected":
      return {
        ...state,
        saving: false,
        enabled: action.prev,
        error: action.error,
      };
  }
};

// ─── Selectors ──────────────────────────────────────────────────────────────

export const selectActiveTour = (state: GuideState): TourDefinition | null =>
  findTour(state.activeTourId);

/** `data-tour` target of the active step, or null when no tour is running. */
export const selectActiveStepTarget = (state: GuideState): string | null => {
  const tour = findTour(state.activeTourId);
  if (!tour) return null;
  const i = Math.min(state.stepIndex, tour.steps.length - 1);
  return (tour.steps[i] as TourStep).target;
};

// ─── Context ────────────────────────────────────────────────────────────────

export interface GuideContextValue {
  state: GuideState;
  dispatch: (action: GuideAction) => void;
  setEnabled: (value: boolean) => void;
}

const GuideContext = createContext<GuideContextValue | null>(null);

export const guidePrefKeys = {
  all: ["guide", "pref"] as const,
};

interface GuideProviderProps {
  children: ReactNode;
}

export const GuideProvider = ({ children }: GuideProviderProps) => {
  const [state, dispatch] = useReducer(guideReducer, initialState);
  const { status } = useAuthState();
  const isAuthenticated = status === "authenticated";
  const queryClient = useQueryClient();

  // Fetch server preference (default true when absent, matching migration 0159).
  useQuery({
    queryKey: guidePrefKeys.all,
    queryFn: async (): Promise<boolean> => {
      const value = await trpcQuery<boolean>("user", "getGuideMe");
      dispatch({ type: "hydrateEnabled", value: value !== false });
      return value !== false;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const mutation = useMutation({
    mutationFn: (value: boolean) =>
      trpcMutation("user", "updateGuideMe", { guideMe: value }),
  });

  const setEnabled = useCallback(
    (value: boolean) => {
      const prev = state.enabled;
      dispatch({ type: "setEnabled.pending", value });
      mutation.mutate(value, {
        onSuccess: () => {
          dispatch({ type: "setEnabled.fulfilled", value });
          queryClient.setQueryData(guidePrefKeys.all, value);
        },
        onError: () => {
          dispatch({
            type: "setEnabled.rejected",
            prev,
            error: "Could not update the guide preference.",
          });
        },
      });
    },
    [state.enabled, mutation, queryClient],
  );

  // Clear active tour if we lose auth mid-session.
  useEffect(() => {
    if (!isAuthenticated && state.activeTourId) {
      dispatch({ type: "endTour" });
    }
  }, [isAuthenticated, state.activeTourId]);

  const value = useMemo<GuideContextValue>(
    () => ({ state, dispatch, setEnabled }),
    [state, setEnabled],
  );

  return (
    <GuideContext.Provider value={value}>{children}</GuideContext.Provider>
  );
};

export const useGuide = (): GuideContextValue => {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error("useGuide must be used within GuideProvider");
  return ctx;
};
