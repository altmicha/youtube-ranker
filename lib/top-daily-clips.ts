import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types/database.types";

// Same pattern already used elsewhere in this codebase (e.g.
// app/actions/videos.ts) — types against the two client factories'
// own return types rather than importing @supabase/supabase-js's
// SupabaseClient directly. This function is called with either: the
// request-scoped client (from createStreamer(), which already has a
// creator's session) or the admin client (from the background
// refresh, which has no user session at all).
type AnySupabaseClient = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

// Fixed display name for every streamer's auto-populated category —
// literally "Top daily clips" as specified, regardless of streamer.
export const TOP_DAILY_CLIPS_NAME = "Top daily clips";

// The category's *slug* can't be the same bare "top-daily-clips" for
// every streamer: the categories table's unique index is
// (platform, kind, slug) — global, with no streamer_id in it — so a
// second streamer inserting the same slug would fail that constraint,
// and even if it didn't, /twitch/top-daily-clips has no streamer
// segment in the URL to disambiguate which streamer's clips to show.
// Each streamer's slug is deterministically derived from their own
// slug instead: /twitch/top-daily-clips-<streamer-slug>. The category
// NAME shown in the UI stays the literal "Top daily clips" either way.
export function topDailyClipsSlug(streamerSlug: string): string {
  return `top-daily-clips-${streamerSlug}`;
}

// True for any category produced by this feature, on either the slug
// pattern above or the fixed name — used to hide the submit form and
// to identify which categories the hourly-ish refresh should target.
export function isTopDailyClipsCategory(category: { slug: string; name: string }): boolean {
  return category.slug.startsWith("top-daily-clips-") || category.name === TOP_DAILY_CLIPS_NAME;
}

/**
 * Creates the streamer's "Top daily clips" official Twitch category if
 * it doesn't already exist. Idempotent — safe to call every time a
 * streamer with a twitch_login is touched (on create, and from the
 * backfill/refresh jobs), not just once.
 *
 * Takes a plain SupabaseClient (works with both the request-scoped
 * client from lib/supabase/server.ts and the admin client) since this
 * is called both from createStreamer() (creator's own session, which
 * already has insert permission for official categories) and from the
 * background refresh (admin client, no user session at all).
 */
export async function ensureTopDailyClipsCategory(
  supabase: AnySupabaseClient,
  streamer: { id: string; slug: string }
): Promise<Category | null> {
  const slug = topDailyClipsSlug(streamer.slug);

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
      name: TOP_DAILY_CLIPS_NAME,
      slug,
      streamer_id: streamer.id,
    })
    .select()
    .single();

  if (error) {
    console.error("ensureTopDailyClipsCategory: insert failed", {
      streamerId: streamer.id,
      slug,
      code: error.code,
      message: error.message,
    });
    return null;
  }

  return created;
}
