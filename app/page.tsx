import { after } from "next/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { streamerCoverUrl } from "@/lib/streamer-image";
import { formatCount } from "@/lib/format";
import { refreshTwitchLiveStatuses } from "@/lib/twitch-live";

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

export default async function HomePage() {
  const supabase = await createClient();

  const { data: streamers } = await supabase
    .from("streamers")
    .select("*")
    .order("display_name");

  const list = streamers ?? [];

  // Do not block the homepage on the live check: this schedules the
  // Twitch refresh to run AFTER the response has already been sent
  // (next/server's after()), so first render always uses whatever
  // is_live/viewer_count are already sitting in the table. The
  // refresh itself skips any streamer checked in the last 60s — see
  // lib/twitch-live.ts.
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
                className="block w-36 no-underline"
              >
                <div className="relative h-48 w-36 overflow-hidden rounded-md bg-muted">
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
                  {streamer.is_live && (
                    <Badge className="absolute left-1.5 top-1.5 border-transparent bg-red-600 px-1.5 py-0 text-[10px] text-white">
                      LIVE
                      {streamer.viewer_count != null && ` · ${formatCount(streamer.viewer_count)}`}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 truncate text-sm">{streamer.display_name}</div>
                <div className="text-[11px] capitalize text-muted-foreground">
                  {streamer.platform}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
