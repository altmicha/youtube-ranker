import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Streamer } from "@/lib/types/database.types";
import { streamerCoverUrl } from "@/lib/streamer-image";

// Locally extends the shared Streamer type (from
// lib/types/database.types.ts, not modified here) with one field
// this page needs that isn't declared there yet: is_live. Kept local
// rather than editing the shared file, per "change only app/page.tsx"
// — select("*") below is resilient to it not actually existing under
// this name (it'd just come back undefined, and the live badge
// simply never shows).
type DirectoryStreamer = Streamer & {
  is_live?: boolean | null;
};

// The creator's image upload (app/actions/streamers.ts,
// uploadStreamerCoverImage) always writes a bare Storage object path
// into cover_path — never a full URL — so that's checked first and
// always run through streamerCoverUrl() to become a usable <img> src.
// avatar_url isn't written by any upload flow in this app today, but
// is checked as a fallback in case it's ever set directly: used as-is
// if it's already a full URL, otherwise also treated as a bare
// Storage path.
function resolveStreamerImage(streamer: DirectoryStreamer): string | null {
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

  const list = (streamers ?? []) as DirectoryStreamer[];

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
