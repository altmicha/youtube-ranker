import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types/database.types";

// Mirrors lib/top-daily-clips.ts exactly, but for a completely
// separate category — Featured clips must not share data with (or be
// derived from) the 24h Top daily clips list, per that section's own
// requirement.
type AnySupabaseClient = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

export const FEATURED_CLIPS_NAME = "Featured clips";

// Same reasoning as topDailyClipsSlug() in lib/top-daily-clips.ts:
// the categories table's unique index is (platform, kind, slug),
// global, with no streamer_id in it, so every streamer needs their
// own distinct slug. The category NAME shown in the UI stays the
// literal "Featured clips" either way.
export function featuredClipsSlug(streamerSlug: string): string {
  return `featured-clips-${streamerSlug}`;
}

export function isFeaturedClipsCategory(category: { slug: string; name: string }): boolean {
  return category.slug.startsWith("featured-clips-") || category.name === FEATURED_CLIPS_NAME;
}

/**
 * Creates the streamer's "Featured clips" official Twitch category if
 * it doesn't already exist. Idempotent — safe to call on every
 * refresh, not just once.
 *
 * The bug this fixes: the previous version looked up "does this
 * already exist" by an exact match on the slug freshly computed from
 * streamer.slug right now, and never checked streamer_id at all. Any
 * existing row that didn't have that exact slug — created before this
 * streamer's own slug last changed, or via any other path, including
 * from /creator — was invisible to that lookup, so it always fell
 * through to inserting a "new" row, which immediately violated the
 * (streamer_id, platform, kind, lower(name)) unique constraint and
 * failed with the exact same error every single time this ran.
 *
 * The lookup now scopes by streamer_id (this streamer's own category,
 * never another streamer's) and matches on EITHER the exact name
 * ("Featured clips", case-insensitive) OR a slug starting with
 * "featured-clips" — whichever this row was actually created with,
 * it's found and reused. Two plain .ilike()/.like() queries rather
 * than a single .or() filter string, to avoid any ambiguity in how
 * that string gets parsed/escaped.
 */
export async function ensureFeaturedClipsCategory(
  supabase: AnySupabaseClient,
  streamer: { id: string; slug: string }
): Promise<Category | null> {
  const slug = featuredClipsSlug(streamer.slug);

  const { data: byName, error: byNameError } = await supabase
    .from("categories")
    .select("*")
    .eq("streamer_id", streamer.id)
    .eq("platform", "twitch")
    .eq("kind", "official")
    .ilike("name", FEATURED_CLIPS_NAME)
    .maybeSingle();

  if (byNameError) {
    console.error("ensureFeaturedClipsCategory: lookup by name failed", {
      streamerId: streamer.id,
      message: byNameError.message,
    });
  }
  if (byName) return byName;

  const { data: bySlug, error: bySlugError } = await supabase
    .from("categories")
    .select("*")
    .eq("streamer_id", streamer.id)
    .eq("platform", "twitch")
    .eq("kind", "official")
    .like("slug", "featured-clips%")
    .maybeSingle();

  if (bySlugError) {
    console.error("ensureFeaturedClipsCategory: lookup by slug prefix failed", {
      streamerId: streamer.id,
      message: bySlugError.message,
    });
  }
  if (bySlug) return bySlug;

  // Not found under either check — genuinely create it. Always via
  // the service-role admin client for the write itself, regardless of
  // which client (request-scoped or admin) the caller passed in for
  // the reads above — categories are publicly readable either way, so
  // the read doesn't need elevated privileges, but the write
  // shouldn't depend on the caller's session having creator-level RLS
  // permission (this function gets called from background jobs with
  // no user session at all).
  const admin = createAdminClient();
  const { data: created, error } = await admin
    .from("categories")
    .insert({
      platform: "twitch",
      kind: "official",
      name: FEATURED_CLIPS_NAME,
      slug,
      streamer_id: streamer.id,
    })
    .select()
    .single();

  if (error) {
    console.error("ensureFeaturedClipsCategory: insert failed", {
      streamerId: streamer.id,
      slug,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  return created;
}
