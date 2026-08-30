import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Streamer } from "@/lib/types/database.types";

// Locally extends the shared Streamer type (from
// lib/types/database.types.ts, not modified here) with two fields
// this page needs that aren't declared there yet: is_live and a
// cover image. Kept local rather than editing the shared file, per
// "change only app/page.tsx" — select("*") below is resilient to
// either column not actually existing under these names (they'd just
// come back undefined, and the card falls back accordingly).
type DirectoryStreamer = Streamer & {
  is_live?: boolean | null;
  cover_url?: string | null;
};

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
            const coverUrl = streamer.cover_url ?? streamer.avatar_url;

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
