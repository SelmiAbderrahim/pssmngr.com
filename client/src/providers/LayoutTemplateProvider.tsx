// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Layout Template Provider
 *
 * Manages the user's UI layout template (vault presentation + density):
 * - localStorage (persistence for all users; always wins as explicit choice)
 * - Database (cross-device sync for authenticated users)
 *
 * The active template's density class is applied to <html> (drives CSS vars in
 * index.css). Mirrors LanguageProvider.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuthState } from "@/providers/AuthProvider";
import {
  useUserLayoutTemplatePreference,
  useUpdateUserLayoutTemplate,
} from "@/hooks/useLayoutTemplate";
import {
  LAYOUT_TEMPLATES,
  DEFAULT_LAYOUT_TEMPLATE,
  isLayoutTemplateId,
  type LayoutTemplateId,
  type LayoutTemplate,
} from "@/config/templates";

const STORAGE_KEY = "pssmngr-layout-template";

interface LayoutTemplateContextValue {
  /** Active template id */
  template: LayoutTemplateId;
  /** Resolved template config (viewMode, densityClass, ...) */
  templateConfig: LayoutTemplate;
  /** Change template (persists to localStorage and DB if authenticated) */
  changeTemplate: (template: LayoutTemplateId) => Promise<void>;
  /** Whether the template is being saved to the DB */
  isSaving: boolean;
}

const LayoutTemplateContext = createContext<
  LayoutTemplateContextValue | undefined
>(undefined);

function readStored(): LayoutTemplateId | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  return isLayoutTemplateId(stored) ? stored : null;
}

/** Apply the density class to <html>, removing any other tpl-* class. */
function applyTemplateClass(template: LayoutTemplateId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const id of Object.keys(LAYOUT_TEMPLATES) as LayoutTemplateId[]) {
    root.classList.remove(LAYOUT_TEMPLATES[id].densityClass);
  }
  root.classList.add(LAYOUT_TEMPLATES[template].densityClass);
}

export function LayoutTemplateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation("settings");
  const { status } = useAuthState();
  const isAuthenticated = status === "authenticated";

  // Start from localStorage (or default); reconcile with DB after fetch.
  const [template, setTemplate] = useState<LayoutTemplateId>(
    () => readStored() ?? DEFAULT_LAYOUT_TEMPLATE
  );
  const [hasAppliedDbPreference, setHasAppliedDbPreference] = useState(false);

  const {
    data: dbTemplate,
    isLoading: isLoadingDb,
    isFetched: isDbFetched,
  } = useUserLayoutTemplatePreference();
  const updateDbTemplate = useUpdateUserLayoutTemplate();

  // Apply density class whenever the active template changes.
  useEffect(() => {
    applyTemplateClass(template);
  }, [template]);

  // Fill from DB only when localStorage is empty (new device scenario).
  useEffect(() => {
    if (
      isAuthenticated &&
      isDbFetched &&
      !isLoadingDb &&
      !hasAppliedDbPreference
    ) {
      if (!readStored() && isLayoutTemplateId(dbTemplate)) {
        setTemplate(dbTemplate);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, dbTemplate);
        }
      }
      setHasAppliedDbPreference(true);
    }
  }, [
    isAuthenticated,
    isDbFetched,
    isLoadingDb,
    dbTemplate,
    hasAppliedDbPreference,
  ]);

  // Reset reconciliation flag on logout.
  useEffect(() => {
    if (!isAuthenticated) setHasAppliedDbPreference(false);
  }, [isAuthenticated]);

  // Cross-tab sync.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && isLayoutTemplateId(e.newValue)) {
        setTemplate(e.newValue);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const changeTemplate = useCallback(
    async (next: LayoutTemplateId) => {
      if (!isLayoutTemplateId(next)) return;

      setTemplate(next);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, next);
      }

      if (isAuthenticated) {
        try {
          await updateDbTemplate.mutateAsync(next);
        } catch (error) {
          console.error("Failed to save layout template:", error);
          toast.error(
            t(
              "layoutTemplate.saveFailed",
              "Failed to save layout template. Please try again."
            )
          );
        }
      }
    },
    [isAuthenticated, updateDbTemplate, t]
  );

  const value = useMemo<LayoutTemplateContextValue>(
    () => ({
      template,
      templateConfig: LAYOUT_TEMPLATES[template],
      changeTemplate,
      isSaving: updateDbTemplate.isPending,
    }),
    [template, changeTemplate, updateDbTemplate.isPending]
  );

  return (
    <LayoutTemplateContext.Provider value={value}>
      {children}
    </LayoutTemplateContext.Provider>
  );
}

export function useLayoutTemplate(): LayoutTemplateContextValue {
  const context = useContext(LayoutTemplateContext);
  if (!context) {
    throw new Error(
      "useLayoutTemplate must be used within LayoutTemplateProvider"
    );
  }
  return context;
}

export { LayoutTemplateContext };
