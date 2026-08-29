import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database.types";
import type { User } from "@supabase/supabase-js";

// "Incognito works, but old cookies hang on mobile" points at a real
// network hang during the refresh-token round trip (a fresh/empty
// session never needs to refresh anything, so it never hits this
// slow path) — not just a fast error response. Checking the `error`
// field alone doesn't help if the call never resolves at all, so
// this bounds it with a hard timeout: if Supabase doesn't answer in
// time, treat it exactly like an auth error (fail open) instead of
// leaving the render waiting.
const AUTH_CHECK_TIMEOUT_MS = 2500;

/**
 * Returns the signed-in user's profile row (including role & points),
 * or null if not signed in. Safe to call from Server Components,
 * Server Actions, and Route Handlers. Wrapped in React's cache() so
 * multiple components calling this within the same request (e.g. the
 * header's login-state and points-badge pieces, each in their own
 * Suspense boundary — see app/layout.tsx) only trigger one actual
 * auth check / DB round trip, not one per caller.
 *
 * There is no session refresh in middleware (deliberately). This
 * function is the single place auth state gets checked, so it's also
 * the single place a stale/invalid/slow session (e.g. "Invalid
 * Refresh Token: Refresh Token Not Found" after a revoked or expired
 * session, or a hung refresh call) gets handled: on any auth error OR
 * timeout, treat the request as logged out immediately — no retry —
 * rather than letting it propagate or hang the page.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  let user: User | null = null;
  let authFailed = false;

  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("auth check timed out")),
          AUTH_CHECK_TIMEOUT_MS
        )
      ),
    ]);
    user = result.data.user;
    authFailed = !!result.error;
  } catch {
    // Timed out, or getUser() itself threw (e.g. malformed cookie).
    authFailed = true;
  }

  if (authFailed || !user) {
    if (authFailed) {
      // Best-effort cookie cleanup. This succeeds when called from a
      // Server Action or Route Handler (e.g. app/actions/*.ts,
      // app/auth/callback/route.ts) — both can write cookies, so the
      // bad session cookie actually gets cleared there. When called
      // from a plain Server Component render (e.g. rendering the
      // homepage on first load), Next.js doesn't allow cookie writes
      // at all, so this is a harmless no-op there — the client-side
      // fallback in components/session-guard.tsx is what actually
      // clears the cookie in that specific case, since browser JS has
      // no such restriction. Race this too, so a slow signOut() can't
      // reintroduce the same hang we just avoided above.
      await Promise.race([
        supabase.auth.signOut().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, AUTH_CHECK_TIMEOUT_MS)),
      ]);
    }
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile ?? null;
});

/** Redirects to /login if there's no signed-in user. Returns the profile. */
export async function requireUser(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

/**
 * Redirects to /login (not signed in) or / (signed in but not a
 * creator) unless the current user has the "creator" role. Use this
 * at the top of any creator-only Server Component or Server Action.
 */
export async function requireCreator(): Promise<Profile> {
  const profile = await requireUser();
  if (profile.role !== "creator") {
    redirect("/");
  }
  return profile;
}
