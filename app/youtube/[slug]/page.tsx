import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { VideoCard } from "@/components/video-card";
import { UpvoteButton } from "@/components/upvote-button";
import { TimeRangeFilter } from "@/components/time-range-filter";
import { Card, CardContent } from "@/components/ui/card";
import { categoryFromSlug } from "@/lib/categories";
import { YOUTUBE_SELECTABLE_CATEGORIES } from "@/lib/types/database.types";
import { parseTimeRange, timeRangeSince, TIME_RANGE_WINDOW_TEXT } from "@/lib/time-range";
import { VideoPlayerProvider } from "@/lib/video-player-context";
import type { Video } from "@/lib/types/database.types";

export default async function YoutubeCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug } = await params;
  // Resolved against YOUTUBE_SELECTABLE_CATEGORIES specifically — a
  // slug that's only valid on Twitch (there currently isn't one, but
  // the two lists are independent) or isn't a real category at all
  // 404s here, rather than silently showing an empty/wrong list.
  const category = categoryFromSlug(slug, YOUTUBE_SELECTABLE_CATEGORIES);
  if (!category) notFound();

  const range = parseTimeRange((await searchParams).range);
  const since = timeRangeSince(range);

  const [profile, supabase] = [await getCurrentProfile(), await createClient()];

  // p_source: "youtube" is what keeps this page from also showing
  // Twitch clips in the same category (e.g. LSF) — see schema.sql.
  const { data: rankedRows } = await supabase.rpc("videos_ranked_by_category", {
    p_category: category,
    p_source: "youtube",
    p_since: since,
  });

  const videos: Video[] | undefined = rankedRows?.map((row) => ({
    id: row.id,
    source: row.source,
    youtube_id: row.youtube_id,
    twitch_clip_slug: row.twitch_clip_slug,
    title: row.title,
    thumbnail_url: row.thumbnail_url,
    channel_name: row.channel_name,
    broadcaster_name: row.broadcaster_name,
    category: row.category,
    view_count: row.view_count,
    like_count: row.like_count,
    dislike_count: row.dislike_count,
    published_at: row.published_at,
    submission_count: row.window_submission_count,
    vote_count: row.vote_count,
    is_removed: row.is_removed,
    created_at: row.created_at,
  }));

  let upvotedVideoIds = new Set<string>();
  if (profile && videos && videos.length > 0) {
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
          href="/youtube"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Back to YouTube categories
        </Link>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {category}
          </h1>
          <TimeRangeFilter basePath="/youtube" categorySlug={slug} active={range} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <VideoPlayerProvider>
          {videos?.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
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
        {(!videos || videos.length === 0) && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No videos submitted in {category}{" "}
              {range === "all" ? "yet." : `in the ${TIME_RANGE_WINDOW_TEXT[range]}.`}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
