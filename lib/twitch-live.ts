import { createAdminClient } from "@/lib/supabase/server";
import { fetchTwitchLiveStatuses } from "@/lib/twitch";

const CHECK_COOLDOWN_MS = 60 * 1000;

// Per-server-instance cooldown tracker (login -> last-checked-at ms).
// Same accepted trade-off as lib/twitch.ts's OAuth token cache: not
// shared across serverless cold starts, so a fresh instance might
// re-check slightly sooner than 60s after a cold start — acceptable,
// not a correctness issue, and avoids adding a new DB column just to
// track this (this feature's own scope only authorizes adding
// twitch_login, nothing else, to the streamers table).
const lastCheckedAt = new Map<string, number>();

/**
 * Checks live status for whichever of the given logins haven't been
 * checked in the last 60 seconds, and writes is_live/viewer_count for
 * those via the admin client — this runs for anonymous homepage
 * visitors too, who have no write access to streamers under normal
 * RLS, so it deliberately bypasses RLS here rather than requiring the
 * visitor to be a creator.
 *
 * Meant to be called via next/server's after() from app/page.tsx, so
 * it never blocks that page's response — errors here are logged, not
 * thrown, since by the time this runs the response is already sent.
 */
export async function refreshTwitchLiveStatuses(
  streamers: { id: string; twitch_login: string }[]
): Promise<void> {
  const now = Date.now();
  const due = streamers.filter((s) => {
    const last = lastCheckedAt.get(s.twitch_login.toLowerCase());
    return !last || now - last > CHECK_COOLDOWN_MS;
  });

  if (due.length === 0) return;

  const statuses = await fetchTwitchLiveStatuses(due.map((s) => s.twitch_login));
  if (statuses.size === 0) return;

  const admin = createAdminClient();

  await Promise.all(
    due.map(async (streamer) => {
      const key = streamer.twitch_login.toLowerCase();
      lastCheckedAt.set(key, now);

      const status = statuses.get(key);
      if (!status) return; // fetchTwitchLiveStatuses failed entirely — leave existing DB values alone

      const { error } = await admin
        .from("streamers")
        .update({ is_live: status.isLive, viewer_count: status.viewerCount })
        .eq("id", streamer.id);

      if (error) {
        console.error("refreshTwitchLiveStatuses: update failed", {
          streamerId: streamer.id,
          code: error.code,
          message: error.message,
        });
      }
    })
  );
}
