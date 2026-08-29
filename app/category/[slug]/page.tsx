import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { VideoCard } from "@/components/video-card";
import { UpvoteButton } from "@/components/upvote-button";
import { TimeRangeFilter } from "@/components/time-range-filter";
import { Card, CardContent } from "@/components/ui/card";
import { categoryFromSlug } from "@/lib/categories";
import { parseTimeRange, timeRangeSince, TIME_RANGE_WINDOW_TEXT } from "@/lib/time-range";
import { VideoPlayerProvider } from "@/lib/video-player-context";
import type { Video } from "@/lib/types/database.types";

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug } = await params;
  const category = categoryFromSlug(slug);

  // Unknown slug (typo, stale link, made-up value) — 404 rather than
  // silently showing an empty or wrong list.
  if (!category) notFound();

  // Requirement 7/9: defaults to weekly; an unrecognized ?range=
  // value (typo, stale link) also falls back to weekly rather than
  // erroring.
  const range = parseTimeRange((await searchParams).range);
  const since = timeRangeSince(range);

  const [profile, supabase] = [await getCurrentProfile(), await createClient()];

  // Requirement 5: ranked by submissions within the selected window,
  // not all-time submission_count — see videos_ranked_by_category()
  // in schema.sql. Works identically for logged-out visitors
  // (requirement 8) since it's just a read.
  const { data: rankedRows } = await supabase.rpc("videos_ranked_by_category", {
    p_category: category,
    p_since: since,
  });

  // Requirement 6: the card's submission-count badge should reflect
  // *why* a video is ranked where it is, so it shows the windowed
  // count while "range" is anything but all-time. vote_count is left
  // exactly as returned (all-time) — upvotes are never windowed.
  const videos: Video[] | undefined = rankedRows?.map((row) => ({
    id: row.id,
    youtube_id: row.youtube_id,
    title: row.title,
    thumbnail_url: row.thumbnail_url,
    channel_name: row.channel_name,
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
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Back to categories
        </Link>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {category}
          </h1>
          <TimeRangeFilter categorySlug={slug} active={range} />
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
