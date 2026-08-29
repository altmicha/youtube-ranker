"use client";

import { useEffect } from "react";

const STORAGE_KEY = "theme";

// Sets the "dark" class on <html> based on the user's remembered
// choice (localStorage), falling back to the OS-level preference on
// a first visit. Runs in a plain useEffect rather than a <script> tag
// — no script/dangerouslySetInnerHTML anywhere in this file or in
// app/layout.tsx.
//
// Trade-off worth knowing: because this only runs after React mounts
// (not before hydration, the way a blocking <script> in <head> would),
// there's a brief moment where the page paints in the default (light)
// theme before this effect flips it to dark, if that's the user's
// preference — a small flash on first load in dark mode. If that
// becomes a problem, the usual fix is a blocking script in <head>,
// which is exactly what was removed here per the request to eliminate
// all script tags from the layout.
export function ThemeInit() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = stored ? stored === "dark" : prefersDark;
      document.documentElement.classList.toggle("dark", isDark);
    } catch {
      // localStorage can throw in some privacy modes — leave the
      // theme as whatever the server rendered (light) in that case.
    }
  }, []);

  return null;
}
