import { createAdminClient } from "@/lib/supabase/server";
import {
  fetchTwitchBroadcasterId,
  fetchTopTwitchClipsLast24h,
} from "@/lib/twitch";
import { ensureTopDailyClipsCategory } from "@/lib/top-daily-clips";

const REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

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
 * their top 10 clips from the last 24 hours, and upserts them into
 * their "Top daily clips" category — creating that category first if
 * it doesn't exist yet (covers both brand-new streamers and any
 * pre-existing ones that predate this feature). Clips that were in
 * the category before but fell out of the new top 10 are soft-removed
 * (is_removed = true), same convention as removeVideo() elsewhere in
 * this app — never hard-deleted.
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

      const topClips = await fetchTopTwitchClipsLast24h(broadcasterId, 10);

      // Upsert each of the current top 10. source/category/kind are
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

      // Remove (soft-delete) anything currently in this category that
      // isn't in the new top 10 — it fell out of the ranking. Handled
      // as two cases rather than a single .not('in', ...) filter with
      // a possibly-empty list, since an empty IN-list's exact
      // PostgREST parsing behavior isn't something to rely on here.
      const keepSlugs = topClips.map((c) => c.slug);
      let removeQuery = admin
        .from("videos")
        .update({ is_removed: true })
        .eq("category", category.slug)
        .eq("source", "twitch")
        .eq("is_removed", false);

      if (keepSlugs.length > 0) {
        removeQuery = removeQuery.not("twitch_clip_slug", "in", `(${keepSlugs.join(",")})`);
      }
      // If keepSlugs is empty (no clips currently qualify), every
      // active clip in this category gets removed — no additional
      // filter needed for that case.

      const { error: removeError } = await removeQuery;

      if (removeError) {
        console.error("refreshTopDailyClips: removing fallen-out clips failed", {
          streamerId: streamer.id,
          code: removeError.code,
          message: removeError.message,
        });
      }
    })
  );
}
