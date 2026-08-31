import { createAdminClient } from "@/lib/supabase/server";
import {
  fetchTwitchBroadcasterId,
  fetchTopTwitchClipsLast24h,
} from "@/lib/twitch";
import { ensureTopDailyClipsCategory } from "@/lib/top-daily-clips";

const REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const MAX_CLIPS_PER_STREAMER = 5;

// Per-server-instance cooldown (streamer id -> last-refreshed-at ms).
// Same accepted trade-off as lib/twitch-live.ts's 60s cooldown: not
// shared across serverless cold starts. This app has no cron
// infrastructure (no vercel.json cron config, no queue) to run this
// truly hourly, so per this feature's own fallback instructions, it
// refreshes opportunistically instead — triggered from /creator and
// from a streamer's /twitch/top-daily-clips-<slug> page load, both
// scheduled via next/server's after() so neither page ever blocks on
// this — capped to once per streamer per hour either way.
const lastRefreshedAt = new Map<string, number>();

/**
 * For each given streamer (with a twitch_login), if it hasn't been
 * refreshed in the last hour: resolves their broadcaster id, fetches
 * their top 5 clips from the last 24 hours, and upserts them into
 * their "Top daily clips" category — creating that category first if
 * it doesn't exist yet (covers both brand-new streamers and any
 * pre-existing ones that predate this feature).
 *
 * Requirement 1 (no duplicates): the upsert below is keyed on
 * twitch_clip_slug — the Twitch clip id — via onConflict, so an
 * already-stored clip is always updated in place, never inserted as
 * a second row. This relies on videos.twitch_clip_slug actually
 * having a real unique constraint in the database; see
 * fix_top_daily_clips_duplicates.sql for the one-time cleanup of any
 * duplicates that predate that constraint being enforced, plus adding
 * it if it was missing.
 *
 * Requirement 2 (cap at 5): after upserting the new top 5, anything
 * that fell out of the ranking is DELETED (not the app's usual
 * is_removed = true soft-delete convention — these are ephemeral,
 * auto-managed rows, and the instruction is explicit about deleting
 * them). Any votes on a clip being deleted are cleared first to avoid
 * a foreign-key violation. A final backstop step re-checks this
 * category's active row count and trims to the top 5 by view_count if
 * it's somehow still over — covers any leftover duplicate that
 * predates fix_top_daily_clips_duplicates.sql.
 *
 * Runs entirely on the admin client: these are system-populated
 * clips, not user submissions — there's no submissions row, no
 * rate-limit check, and no tie to whichever visitor's page load
 * happened to trigger this.
 */
export async function refreshTopDailyClips(
  streamers: { id: string; slug: string; twitch_login: string }[]
): Promise<void> {
  const now = Date.now();
  const due = streamers.filter((s) => {
    const last = lastRefreshedAt.get(s.id);
    return !last || now - last > REFRESH_COOLDOWN_MS;
  });

  if (due.length === 0) return;

  const admin = createAdminClient();

  await Promise.all(
    due.map(async (streamer) => {
      lastRefreshedAt.set(streamer.id, now);

      const category = await ensureTopDailyClipsCategory(admin, streamer);
      if (!category) return;

      const broadcasterId = await fetchTwitchBroadcasterId(streamer.twitch_login);
      if (!broadcasterId) return;

      const topClips = await fetchTopTwitchClipsLast24h(broadcasterId, MAX_CLIPS_PER_STREAMER);

      // Upsert each of the current top 5. source/category/kind are
      // fixed for every row here; on conflict (same twitch_clip_slug,
      // i.e. this clip was already in some category before), refresh
      // its stats and make sure it's filed under this category and
      // marked active again if it had been soft-removed.
      for (const clip of topClips) {
        const { error } = await admin
          .from("videos")
          .upsert(
            {
              source: "twitch",
              twitch_clip_slug: clip.slug,
              title: clip.title,
              thumbnail_url: clip.thumbnailUrl,
              broadcaster_name: clip.broadcasterName,
              category: category.slug,
              category_id: category.id,
              view_count: clip.viewCount,
              published_at: clip.createdAt,
              is_removed: false,
            },
            { onConflict: "twitch_clip_slug" }
          );

        if (error) {
          console.error("refreshTopDailyClips: upsert clip failed", {
            streamerId: streamer.id,
            slug: clip.slug,
            code: error.code,
            message: error.message,
          });
        }
      }

      // Remove anything currently in this category that isn't in the
      // new top 5 — it fell out of the ranking. Requirement: a real
      // DELETE here, not the app's usual is_removed = true soft-delete
      // convention — these are ephemeral, auto-managed rows, and the
      // instruction is explicit about deleting, not just hiding them.
      // votes referencing a row have to go first, or the delete below
      // would fail on a foreign-key violation the moment anyone had
      // voted on a clip that then fell out of the top 5.
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
      // If keepSlugs is empty (no clips currently qualify), every
      // active clip in this category has fallen out — no additional
      // filter needed for that case, same reasoning as elsewhere in
      // this file: an empty IN-list's exact PostgREST parsing isn't
      // something to rely on, so it's handled as a separate branch
      // rather than building a literal "()" into the filter value.

      const { data: fellOut } = await fellOutQuery;

      const fellOutIds = (fellOut ?? []).map((v) => v.id);

      if (fellOutIds.length > 0) {
        const { error: votesError } = await admin.from("votes").delete().in("video_id", fellOutIds);
        if (votesError) {
          console.error("refreshTopDailyClips: clearing votes on fallen-out clips failed", {
            streamerId: streamer.id,
            code: votesError.code,
            message: votesError.message,
          });
        }

        const { error: deleteError } = await admin.from("videos").delete().in("id", fellOutIds);
        if (deleteError) {
          console.error("refreshTopDailyClips: deleting fallen-out clips failed", {
            streamerId: streamer.id,
            code: deleteError.code,
            message: deleteError.message,
          });
        }
      }

      // Requirement 2, explicit backstop: after the above, re-check
      // this category's actual active row count and trim to the top
      // 5 by view_count if it's somehow still over — covers any
      // leftover duplicate rows for the same clip that the fix above
      // hasn't cleaned up yet.
      const { data: activeClips, error: activeError } = await admin
        .from("videos")
        .select("id")
        .eq("category_id", category.id)
        .eq("is_removed", false)
        .order("view_count", { ascending: false, nullsFirst: false });

      if (activeError) {
        console.error("refreshTopDailyClips: checking active clip count failed", {
          streamerId: streamer.id,
          code: activeError.code,
          message: activeError.message,
        });
      } else if (activeClips && activeClips.length > MAX_CLIPS_PER_STREAMER) {
        const idsToTrim = activeClips.slice(MAX_CLIPS_PER_STREAMER).map((v) => v.id);

        const { error: trimVotesError } = await admin.from("votes").delete().in("video_id", idsToTrim);
        if (trimVotesError) {
          console.error("refreshTopDailyClips: clearing votes on trimmed clips failed", {
            streamerId: streamer.id,
            code: trimVotesError.code,
            message: trimVotesError.message,
          });
        }

        const { error: trimError } = await admin.from("videos").delete().in("id", idsToTrim);
        if (trimError) {
          console.error("refreshTopDailyClips: trimming to top 5 failed", {
            streamerId: streamer.id,
            code: trimError.code,
            message: trimError.message,
          });
        }
      }
    })
  );
}
