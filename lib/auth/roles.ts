import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database.types";

/**
 * Returns the signed-in user's profile row (including role & points),
 * or null if not signed in. Safe to call from Server Components,
 * Server Actions, and Route Handlers.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

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
