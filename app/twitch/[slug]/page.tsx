import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { VideoCard } from "@/components/video-card";
import { UpvoteButton } from "@/components/upvote-button";
import { TimeRangeFilter } from "@/components/time-range-filter";
import { Card, CardContent } from "@/components/ui/card";
import { parseTimeRange, timeRangeSince, TIME_RANGE_WINDOW_TEXT } from "@/lib/time-range";
import { VideoPlayerProvider } from "@/lib/video-player-context";
import { rankVideosByWindow } from "@/lib/rank-videos";

export default async function TwitchCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // Live lookup by (platform, slug) — used only to confirm the slug
  // is real and to get its display name; the actual video filter
  // below uses (source, category) directly, not this row's id.
  const { data: category } = await supabase
    .from("categories")
    .select("*")
    .eq("platform", "twitch")
    .eq("slug", slug)
    .single();

  if (!category) notFound();

  const range = parseTimeRange((await searchParams).range);
  const since = timeRangeSince(range);

  const profile = await getCurrentProfile();

  // Requirement 2/5: the exact same query shape as /videos — plain
  // .from("videos").select("*"), just with source+category filters
  // added — instead of a custom RPC. That RPC broke three separate
  // times against this database (enum/text mismatches, stale
  // signatures); this way there's no custom SQL function left to
  // drift out of sync with the schema.
  const { data: baseVideos, error: videosError } = await supabase
    .from("videos")
    .select("*")
    .eq("source", "twitch")
    .eq("category", slug)
    .eq("is_removed", false)
    .order("submission_count", { ascending: false })
    .limit(50);

  if (videosError) {
    console.error("TwitchCategoryPage: videos query failed", {
      slug,
      code: videosError.code,
      message: videosError.message,
    });
  }

  // Requirement 3: windowed ranking (daily/weekly/monthly) computed
  // in JS from a plain submissions query — see lib/rank-videos.ts.
  const videos = await rankVideosByWindow(supabase, baseVideos ?? [], since);

  let upvotedVideoIds = new Set<string>();
  if (profile && videos.length > 0) {
    const { data: myVotes } = await supabase
      .from("votes")
      .select("video_id")
      .eq("user_id", profile.id)
      .in(
        "video_id",
        videos.map((v) => v.id)
      );
    upvotedVideoIds = new Set(myVotes?.map((v) => v.video_id));
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/twitch"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Back to Twitch categories
        </Link>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {category.name}
          </h1>
          <TimeRangeFilter basePath="/twitch" categorySlug={slug} active={range} />
        </div>

        {/* Requirement: show the real filter being used. */}
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          filter: source=twitch · category={slug}
        </p>

        {/* Requirement 4: show the real error, not a silent/blank page. */}
        {videosError && (
          <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Could not load videos: {videosError.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <VideoPlayerProvider>
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              categoryName={category.name}
              action={
                <UpvoteButton
                  videoId={video.id}
                  voteCount={video.vote_count}
                  initialUpvoted={upvotedVideoIds.has(video.id)}
                  isLoggedIn={!!profile}
                />
              }
            />
          ))}
        </VideoPlayerProvider>
        {videos.length === 0 && !videosError && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No clips submitted in {category.name}{" "}
              {range === "all" ? "yet." : `in the ${TIME_RANGE_WINDOW_TEXT[range]}.`}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
