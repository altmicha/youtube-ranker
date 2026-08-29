"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Guards against exactly the "old cookie on mobile hangs the site"
// case: the server-side check in lib/auth/roles.ts already fails
// open quickly (timeout + catch), so the page itself always renders
// — but a Server Component can't actually delete a bad cookie
// (Next.js only allows cookie writes from Server Actions/Route
// Handlers). The browser has no such restriction, so this runs once
// after the page has already rendered, and if the local session is
// broken, clears it for real and reloads exactly once to get a
// genuinely clean subsequent request.
const RELOAD_GUARD_KEY = "auth-recovery-reload-attempted";
const SESSION_CHECK_TIMEOUT_MS = 4000;

export function SessionGuard() {
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      // Requirement 5: never loop. Once this tab has already tried
      // the recover-and-reload dance, don't try again no matter what
      // the session check says — sessionStorage is per-tab, so a
      // fresh tab/visit still gets one attempt if needed.
      if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return;

      const supabase = createClient();

      let broken = false;
      try {
        const { error } = await Promise.race([
          supabase.auth.getUser(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("session check timed out")),
              SESSION_CHECK_TIMEOUT_MS
            )
          ),
        ]);
        broken = !!error;
      } catch {
        broken = true;
      }

      if (cancelled || !broken) return;

      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");

      // scope: 'local' clears only this browser's stored
      // session/cookies — no network call to revoke server-side,
      // which matters here since the whole point is that the network
      // round trip for this session is what's unreliable.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});

      window.location.reload();
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
