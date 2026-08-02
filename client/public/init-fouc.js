// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
// Early theme + RTL detection to prevent FOUC. Loaded as an external,
// render-blocking script so it complies with the strict CSP
// (script-src 'self' — inline scripts are blocked).

// Theme detection
if (
  localStorage.theme === "dark" ||
  (!("theme" in localStorage) &&
    window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
  document.documentElement.classList.add("dark");
  document.documentElement.style.colorScheme = "dark";
} else {
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "light";
}

// RTL detection — ?lang= wins over the stored preference, mirroring the
// i18next detection order (querystring before localStorage).
(function () {
  var supportedLangs = ["en", "ar", "es", "fr", "de"];
  var queryLang = null;
  try {
    queryLang = new URLSearchParams(window.location.search).get("lang");
  } catch (e) {
    queryLang = null;
  }
  var lang =
    queryLang && supportedLangs.indexOf(queryLang) !== -1
      ? queryLang
      : localStorage.getItem("i18nextLng");
  var rtlLanguages = ["ar", "he", "fa", "ur"];
  if (lang && rtlLanguages.indexOf(lang) !== -1) {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = lang;
  }
})();
