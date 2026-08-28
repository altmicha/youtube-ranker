"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "theme";

export function ThemeToggle() {
  // Start as null (unknown) so we render nothing until mounted —
  // avoids a mismatch between server-rendered markup (which has no
  // way to know the user's stored/system preference) and the client.
  // The blocking script in <head> (see app/layout.tsx) has already
  // set the real class on <html> by the time this ever paints, so
  // this brief "unknown" state never causes a visible flash.
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    // Requirement 3: remember the user's explicit choice.
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    setIsDark(next);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Render a stable placeholder until mounted to avoid layout
          shift; once mounted, show the icon for the mode you'd
          switch TO. */}
      {isDark === null ? (
        <span className="h-4 w-4" />
      ) : isDark ? (
        <span aria-hidden>☀️</span>
      ) : (
        <span aria-hidden>🌙</span>
      )}
    </Button>
  );
}
