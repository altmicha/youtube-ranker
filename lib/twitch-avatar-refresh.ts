import { createAdminClient } from "@/lib/supabase/server";
import { fetchTwitchProfileImages } from "@/lib/twitch";

const REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// Per-server-instance cooldown (streamer id -> last-refreshed-at ms).
// Same accepted trade-off as the other Twitch background jobs in this
// app (lib/twitch-live.ts's 60s cooldown, lib/top-daily-clips-refresh.ts's
// 1h cooldown) — not shared across serverless cold starts, which is
// fine here for the same reasons.
const lastRefreshedAt = new Map<string, number>();

/**
 * For each given streamer (with a twitch_login), if it hasn't been
 * refreshed in the last hour: fetches their current Twitch profile
 * picture and writes it to streamers.avatar_url via the admin client.
 *
 * Never touches cover_path — the creator's own uploaded cover image
 * (app/actions/streamers.ts's uploadStreamerCoverImage) is a
 * completely separate field, and app/page.tsx's resolveStreamerImage()
 * already prefers cover_path over avatar_url whenever both are set.
 * So this always keeps avatar_url in sync with Twitch, but a custom
 * cover — if one exists — still wins for what's actually displayed;
 * there's nothing to "check" here to avoid overwriting it, because
 * this function never writes to that field at all.
 *
 * Requirement: uses only TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET (via
 * fetchTwitchProfileImages(), same credentials contract as every other
 * Twitch call in this app) and the service-role admin client for the
 * write — no user auth session anywhere in this path. Wrapped in
 * try/catch, same defensive pattern as lib/twitch-live.ts, so a
 * stale/invalid visitor session can never affect this regardless of
 * how such an error might otherwise surface.
 */
export async function refreshTwitchAvatars(
  streamers: { id: string; twitch_login: string }[]
): Promise<void> {
  try {
    const now = Date.now();
    const due = streamers.filter((s) => {
      const last = lastRefreshedAt.get(s.id);
      return !last || now - last > REFRESH_COOLDOWN_MS;
    });

    if (due.length === 0) return;

    const images = await fetchTwitchProfileImages(due.map((s) => s.twitch_login));
    if (images.size === 0) return;

    const admin = createAdminClient();

    await Promise.all(
      due.map(async (streamer) => {
        lastRefreshedAt.set(streamer.id, now);

        const imageUrl = images.get(streamer.twitch_login.toLowerCase());
        if (!imageUrl) return; // Twitch didn't return anything for this login this time

        const { error } = await admin
          .from("streamers")
          .update({ avatar_url: imageUrl })
          .eq("id", streamer.id);

        if (error) {
          console.error("refreshTwitchAvatars: update failed", {
            streamerId: streamer.id,
            code: error.code,
            message: error.message,
          });
        }
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/refresh token/i.test(message)) {
      console.warn("refreshTwitchAvatars: ignoring unrelated auth/refresh-token error", message);
    } else {
      console.error("refreshTwitchAvatars: unexpected error", err);
    }
  }
}
