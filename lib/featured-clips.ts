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
 * refresh, not just once. Same AnySupabaseClient contract as
 * ensureTopDailyClipsCategory() (works with both the request-scoped
 * client and the admin client).
 */
export async function ensureFeaturedClipsCategory(
  supabase: AnySupabaseClient,
  streamer: { id: string; slug: string }
): Promise<Category | null> {
  const slug = featuredClipsSlug(streamer.slug);

  const { data: existing } = await supabase
    .from("categories")
    .select("*")
    .eq("platform", "twitch")
    .eq("slug", slug)
    .eq("kind", "official")
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
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
    });
    return null;
  }

  return created;
}
