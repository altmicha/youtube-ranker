import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database.types";

/**
 * Returns the signed-in user's profile row (including role & points),
 * or null if not signed in. Safe to call from Server Components,
 * Server Actions, and Route Handlers.
 *
 * There is no session refresh in middleware (deliberately — see
 * middleware removal). This function is the single place auth state
 * gets checked, so it's also the single place a stale/invalid session
 * (e.g. "Invalid Refresh Token: Refresh Token Not Found" after a
 * revoked or expired session) gets handled: on any auth error, treat
 * the request as logged out immediately — no retry — rather than
 * letting the error propagate and break the page.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    if (error) {
      // Best-effort cookie cleanup. This succeeds when called from a
      // Server Action or Route Handler (e.g. app/actions/*.ts,
      // app/auth/callback/route.ts) — both can write cookies, so the
      // bad session cookie actually gets cleared there. When called
      // from a plain Server Component render (e.g. rendering the
      // homepage), Next.js doesn't allow cookie writes at all, so
      // this is a harmless no-op — the same restriction already
      // handled by the try/catch in lib/supabase/server.ts's setAll.
      // Either way, this function still returns null immediately
      // below: the page renders as logged-out regardless of whether
      // the cookie write landed.
      await supabase.auth.signOut().catch(() => {});
    }
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile ?? null;
}

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
