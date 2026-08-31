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
 * Requirement 1/2: fetchTwitchLiveStatuses() (lib/twitch.ts) only ever
 * uses TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET — nothing in this
 * function or that one calls supabase.auth.getUser()/getSession()/
 * refreshSession(), so a visitor's Supabase session state (valid,
 * missing, or a stale/invalid refresh token) can't affect whether the
 * Twitch check itself runs.
 *
 * Requirement 3: createAdminClient() is a plain @supabase/supabase-js
 * client constructed from the service-role key — it never reads
 * cookies and never touches the visitor's session at all (see
 * lib/supabase/server.ts). It's used for every write below instead of
 * the cookie-bound request client for exactly that reason.
 *
 * Requirement 5: wrapped in try/catch so that if anything unexpected
 * throws here (this runs inside next/server's after(), where an
 * uncaught rejection would otherwise surface as an unhandled
 * rejection in server logs with no connection to what the visitor
 * actually saw) — including, defensively, an auth-shaped error that
 * has no business being here at all — it's logged and swallowed
 * rather than propagating anywhere.
 */
export async function refreshTwitchLiveStatuses(
  streamers: { id: string; twitch_login: string }[]
): Promise<void> {
  try {
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

        // Requirement 4: offline is always is_live = false AND
        // viewer_count = 0 (not null) — a streamer that's offline has
        // zero current viewers, which is a real, known value, not an
        // absence of data.
        const { error } = await admin
          .from("streamers")
          .update({
            is_live: status.isLive,
            viewer_count: status.isLive ? status.viewerCount : 0,
          })
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
  } catch (err) {
    // Requirement 5: specifically call out an auth/refresh-token-shaped
    // error if that's what this is, but log and continue either way —
    // this must never take the homepage down with it.
    const message = err instanceof Error ? err.message : String(err);
    if (/refresh token/i.test(message)) {
      console.warn("refreshTwitchLiveStatuses: ignoring unrelated auth/refresh-token error", message);
    } else {
      console.error("refreshTwitchLiveStatuses: unexpected error", err);
    }
  }
}
