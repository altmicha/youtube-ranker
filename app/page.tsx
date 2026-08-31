import { after } from "next/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { streamerCoverUrl } from "@/lib/streamer-image";
import { formatCount } from "@/lib/format";
import { refreshTwitchLiveStatuses } from "@/lib/twitch-live";

// Requirement: do not cache the homepage — live badges need to
// reflect the current state on every load, not a cached render from
// whenever a streamer last happened to go live. force-dynamic also
// rules out this page being eligible for static generation, which
// export const revalidate alone wouldn't fully guarantee.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// The creator's image upload (app/actions/streamers.ts,
// uploadStreamerCoverImage) always writes a bare Storage object path
// into cover_path — never a full URL — so that's checked first and
// always run through streamerCoverUrl() to become a usable <img> src.
// avatar_url isn't written by any upload flow in this app today, but
// is checked as a fallback in case it's ever set directly: used as-is
// if it's already a full URL, otherwise also treated as a bare
// Storage path.
function resolveStreamerImage(streamer: { cover_path: string | null; avatar_url: string | null }): string | null {
  if (streamer.cover_path) {
    return streamerCoverUrl(streamer.cover_path);
  }
  if (streamer.avatar_url) {
    return streamer.avatar_url.startsWith("http")
      ? streamer.avatar_url
      : streamerCoverUrl(streamer.avatar_url);
  }
  return null;
}

async function fetchStreamers(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.from("streamers").select("*").order("display_name");
  if (error) throw error;
  return data ?? [];
}

export default async function HomePage() {
  const supabase = await createClient();

  // Requirement 1/2: this page never calls getUser(), getSession(), or
  // refreshSession() anywhere, directly or indirectly — the query
  // below is a plain public select (streamers are publicly readable),
  // nothing here depends on who's viewing or their session state.
  //
  // Requirement 5: still wrapped defensively — if the visitor has a
  // stale/invalid session cookie, Supabase's client machinery can
  // itself surface an "Invalid Refresh Token: Refresh Token Not
  // Found" auth error as a side effect of preparing ANY request,
  // even one that never explicitly asks for the session. That error
  // has nothing to do with whether streamers/live badges can be
  // shown, so it's logged and ignored here rather than allowed to
  // affect this page at all.
  let list: Awaited<ReturnType<typeof fetchStreamers>> = [];
  try {
    list = await fetchStreamers(supabase);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/refresh token/i.test(message)) {
      console.warn("HomePage: ignoring unrelated auth/refresh-token error", message);
    } else {
      console.error("HomePage: streamers query failed", err);
    }
  }

  // Do not block the homepage on the live check: this schedules the
  // Twitch refresh to run AFTER the response has already been sent
  // (next/server's after()), so first render always uses whatever
  // is_live/viewer_count are already sitting in the table. The
  // refresh itself skips any streamer checked in the last 60s — see
  // lib/twitch-live.ts.
  // Requirement: platform may be "both" (or null, or "youtube") on a
  // streamer that still has a twitch_login set — platform is vestigial
  // now (a streamer isn't tied to one platform; see
  // make_streamer_platform_optional.sql) and is never checked here.
  // The only thing that determines whether a streamer's live status
  // gets checked is whether twitch_login is set, full stop.
  const streamersWithTwitchLogin = list
    .filter((s): s is typeof s & { twitch_login: string } => !!s.twitch_login)
    .map((s) => ({ id: s.id, twitch_login: s.twitch_login }));

  if (streamersWithTwitchLogin.length > 0) {
    after(() => refreshTwitchLiveStatuses(streamersWithTwitchLogin));
  }

  // YouTube live isn't checked — there's no existing YouTube live
  // status integration in this app to wire this into (fetchYoutubeMetadata()
  // only ever fetches video stats, never channel live status), so
  // streamers.is_live/viewer_count for a youtube_channel_id-only
  // streamer are left exactly as whatever's already in the table.

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          Find a streamer
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse streamers and see their categories.
        </p>
      </div>

      {list.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No streamers yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-3">
          {list.map((streamer) => {
            const coverUrl = resolveStreamerImage(streamer);

            return (
              <Link
                key={streamer.id}
                href={`/streamer/${streamer.slug}`}
                className="block w-36 no-underline rounded-2xl p-2"
                style={streamer.is_live ? { border: "2px solid #ef4444" } : { border: "2px solid transparent" }}
              >
                <div className="relative h-48 w-full overflow-hidden rounded-md bg-muted">
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coverUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-muted-foreground">
                      {streamer.display_name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </div>
                {streamer.is_live && (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold" style={{ color: "#ef4444" }}>
                      LIVE
                    </span>
                    {streamer.viewer_count != null && (
                      <span className="text-sm text-muted-foreground">
                        viewers {formatCount(streamer.viewer_count)}
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-1 truncate text-sm">{streamer.display_name}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
