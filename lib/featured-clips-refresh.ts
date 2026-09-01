import { createAdminClient } from "@/lib/supabase/server";
import {
  fetchTwitchBroadcasterId,
  fetchTopTwitchClipsLast30Days,
} from "@/lib/twitch";
import { ensureFeaturedClipsCategory } from "@/lib/featured-clips";

const REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const MAX_CLIPS_PER_STREAMER = 6;

// Mirrors lib/top-daily-clips-refresh.ts exactly, except the data
// source: last 30 days instead of last 24 hours, and its own separate
// category (lib/featured-clips.ts) — Featured clips must not read
// from or share data with Top daily clips, per that section's own
// requirement. Its own cooldown map too, so the two jobs' timing is
// fully independent even though they run for the same streamer list.
const lastRefreshedAt = new Map<string, number>();

/**
 * For each given streamer (with a twitch_login), if it hasn't been
 * refreshed in the last hour: resolves their broadcaster id, fetches
 * their top 5 clips from the last 30 days, and upserts them into
 * their "Featured clips" category — creating that category first if
 * it doesn't exist yet.
 *
 * `force`: bypasses the cooldown for the given streamers. Used by
 * app/streamer/[slug]/page.tsx specifically when the Featured clips
 * category already exists but currently has zero clips in it — e.g.
 * the category was recreated after being deleted, but this function's
 * own in-memory "last refreshed" timestamp from before that reset was
 * still within the last hour, so the normal cooldown check would keep
 * silently skipping it (a category card with nothing in it,
 * indefinitely) even though nothing has actually been fetched since
 * the reset. Not used for the routine background refresh — that stays
 * cooldown-limited as before.
 *
 * No duplicates: upsert is keyed on twitch_clip_slug via onConflict,
 * same as Top daily clips — an already-stored clip is updated in
 * place, never inserted as a second row.
 *
 * Cap at 5, real deletion (not is_removed = true) for anything that
 * falls out of the ranking — same conventions as Top daily clips, for
 * the same reasons (ephemeral, auto-managed rows; votes on a clip
 * being deleted are cleared first to avoid a foreign-key violation).
 *
 * Note: since twitch_clip_slug is globally unique across videos, a
 * clip that's simultaneously in both this streamer's top-5-last-30-days
 * AND their top-5-last-24h can only be filed under one category's
 * category_id at a time — whichever job last touched that row "owns"
 * it. The clip's own data (views, thumbnail, vote_count) stays correct
 * either way; only which section currently lists it can shift. This is
 * an accepted consequence of every video having a single category
 * rather than a case this job specifically works around.
 *
 * Runs entirely on the admin client — system-populated, not a user
 * submission, no rate-limit check, no tie to whichever visitor's page
 * load triggered this.
 */
export async function refreshFeaturedClips(
  streamers: { id: string; slug: string; twitch_login: string }[],
  options: { force?: boolean } = {}
): Promise<void> {
  const now = Date.now();
  const due = streamers.filter((s) => {
    if (options.force) return true;
    const last = lastRefreshedAt.get(s.id);
    return !last || now - last > REFRESH_COOLDOWN_MS;
  });

  if (due.length === 0) return;

  const admin = createAdminClient();

  await Promise.all(
    due.map(async (streamer) => {
      lastRefreshedAt.set(streamer.id, now);

      const category = await ensureFeaturedClipsCategory(admin, streamer);
      if (!category) return;

      const broadcasterId = await fetchTwitchBroadcasterId(streamer.twitch_login);
      if (!broadcasterId) return;

      const topClips = await fetchTopTwitchClipsLast30Days(broadcasterId, MAX_CLIPS_PER_STREAMER);

      for (const clip of topClips) {
        // Requirement: don't let a clip end up with a missing
        // thumbnail. thumbnail_url comes from the same field/payload
        // Top daily clips uses (see lib/twitch.ts's shared
        // fetchTopTwitchClipsInWindow() — both jobs map Twitch's own
        // clip.thumbnail_url into TwitchClipSummary.thumbnailUrl the
        // exact same way). If this particular fetch came back without
        // one (e.g. Twitch hadn't finished generating it yet for a
        // very recent clip) but a prior row already has a good value —
        // this can happen for a clip trending in both this streamer's
        // last-24h AND last-30-days windows — a plain upsert would
        // silently overwrite that good value with null. Omitting the
        // key here instead leaves whatever's already stored alone.
        const upsertPayload: Record<string, unknown> = {
          source: "twitch",
          twitch_clip_slug: clip.slug,
          title: clip.title,
          broadcaster_name: clip.broadcasterName,
          category: category.slug,
          category_id: category.id,
          view_count: clip.viewCount,
          published_at: clip.createdAt,
          is_removed: false,
        };
        if (clip.thumbnailUrl) {
          upsertPayload.thumbnail_url = clip.thumbnailUrl;
        }

        const { error } = await admin
          .from("videos")
          .upsert(upsertPayload, { onConflict: "twitch_clip_slug" });

        if (error) {
          console.error("refreshFeaturedClips: upsert clip failed", {
            streamerId: streamer.id,
            slug: clip.slug,
            code: error.code,
            message: error.message,
          });
        }
      }

      const keepSlugs = topClips.map((c) => c.slug);

      let fellOutQuery = admin
        .from("videos")
        .select("id")
        .eq("category", category.slug)
        .eq("source", "twitch")
        .eq("is_removed", false);

      if (keepSlugs.length > 0) {
        fellOutQuery = fellOutQuery.not("twitch_clip_slug", "in", `(${keepSlugs.join(",")})`);
      }

      const { data: fellOut } = await fellOutQuery;
      const fellOutIds = (fellOut ?? []).map((v) => v.id);

      if (fellOutIds.length > 0) {
        const { error: votesError } = await admin.from("votes").delete().in("video_id", fellOutIds);
        if (votesError) {
          console.error("refreshFeaturedClips: clearing votes on fallen-out clips failed", {
            streamerId: streamer.id,
            code: votesError.code,
            message: votesError.message,
          });
        }

        const { error: deleteError } = await admin.from("videos").delete().in("id", fellOutIds);
        if (deleteError) {
          console.error("refreshFeaturedClips: deleting fallen-out clips failed", {
            streamerId: streamer.id,
            code: deleteError.code,
            message: deleteError.message,
          });
        }
      }

      const { data: activeClips, error: activeError } = await admin
        .from("videos")
        .select("id")
        .eq("category_id", category.id)
        .eq("is_removed", false)
        .order("view_count", { ascending: false, nullsFirst: false });

      if (activeError) {
        console.error("refreshFeaturedClips: checking active clip count failed", {
          streamerId: streamer.id,
          code: activeError.code,
          message: activeError.message,
        });
      } else if (activeClips && activeClips.length > MAX_CLIPS_PER_STREAMER) {
        const idsToTrim = activeClips.slice(MAX_CLIPS_PER_STREAMER).map((v) => v.id);

        const { error: trimVotesError } = await admin.from("votes").delete().in("video_id", idsToTrim);
        if (trimVotesError) {
          console.error("refreshFeaturedClips: clearing votes on trimmed clips failed", {
            streamerId: streamer.id,
            code: trimVotesError.code,
            message: trimVotesError.message,
          });
        }

        const { error: trimError } = await admin.from("videos").delete().in("id", idsToTrim);
        if (trimError) {
          console.error("refreshFeaturedClips: trimming to top 5 failed", {
            streamerId: streamer.id,
            code: trimError.code,
            message: trimError.message,
          });
        }
      }
    })
  );
}
