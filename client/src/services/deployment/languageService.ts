// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
export const LanguageService = {
  getPreferredLanguage: async (): Promise<string | null> => {
    const { trpcQuery } = await import("@/lib/api/trpc");
    return trpcQuery<string | null>("user", "getLanguage");
  },
  updatePreferredLanguage: async (language: string): Promise<void> => {
    const { trpcMutation } = await import("@/lib/api/trpc");
    await trpcMutation("user", "updateLanguage", {
      preferredLanguage: language,
    });
  },
};

export function getLanguages() {
  return [];
}

export function setLanguage(_language: string) {}
