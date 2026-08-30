import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, canSubmitOnCategoryPage } from "@/lib/auth/roles";
import { VideoCard } from "@/components/video-card";
import { UpvoteButton } from "@/components/upvote-button";
import { TimeRangeFilter } from "@/components/time-range-filter";
import { LoadMoreLink, PAGE_SIZE } from "@/components/load-more-link";
import { SubmitVideoForm } from "@/components/submit-video-form";
import { Card, CardContent } from "@/components/ui/card";
import { parseTimeRange, timeRangeSince, TIME_RANGE_WINDOW_TEXT } from "@/lib/time-range";
import { VideoPlayerProvider } from "@/lib/video-player-context";
import { rankVideosByWindow } from "@/lib/rank-videos";

export default async function YoutubeCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; take?: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: category } = await supabase
    .from("categories")
    .select("*")
    .eq("platform", "youtube")
    .eq("slug", slug)
    .single();

  if (!category) notFound();

  // Requirement: back link goes to the category's streamer, not the
  // platform page. Looked up dynamically from category.streamer_id —
  // works for any streamer, nothing hardcoded. Falls back to a plain
  // link home if this category has no streamer assigned.
  let backHref = "/";
  let backLabel = "← Back home";
  if (category.streamer_id) {
    const { data: streamer } = await supabase
      .from("streamers")
      .select("slug, display_name")
      .eq("id", category.streamer_id)
      .single();
    if (streamer) {
      backHref = `/streamer/${streamer.slug}`;
      backLabel = `← Back to ${streamer.display_name}`;
    }
  }

  const sp = await searchParams;
  const range = parseTimeRange(sp.range);
  const since = timeRangeSince(range);

  // Requirement 4: 30 per load, more on demand via ?take=. Clamped so
  // a hand-edited URL can't request something absurd.
  const requestedTake = parseInt(sp.take ?? "", 10);
  const take = Number.isFinite(requestedTake) && requestedTake > PAGE_SIZE
    ? Math.min(requestedTake, 500)
    : PAGE_SIZE;

  const profile = await getCurrentProfile();

  const { data: baseVideos, error: videosError } = await supabase
    .from("videos")
    .select("*")
    .eq("source", "youtube")
    .eq("category", slug)
    .eq("is_removed", false)
    .order("submission_count", { ascending: false })
    .limit(take);

  if (videosError) {
    console.error("YoutubeCategoryPage: videos query failed", {
      slug,
      code: videosError.code,
      message: videosError.message,
    });
  }

  // A full page back means there may be more beyond this cutoff.
  const hasMore = (baseVideos?.length ?? 0) === take;

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
          href={backHref}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          {backLabel}
        </Link>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {category.name}
          </h1>
          <TimeRangeFilter basePath="/youtube" categorySlug={slug} active={range} />
        </div>

        <p className="mt-1 font-mono text-xs text-muted-foreground">
          filter: source=youtube · category={slug}
        </p>

        {videosError && (
          <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Could not load videos: {videosError.message}
          </p>
        )}
      </div>

      {/*
        Requirement: only creator/streamer/admin roles see this — not
        a signed-out visitor, not a plain "user". Reuses the exact
        same SubmitVideoForm used on /youtube, just constrained to a
        single-item categories array (this page's own category), so
        the submission always lands in "the category of the current
        page" with zero changes to that component. Works for every
        category/streamer automatically since `category` is looked up
        dynamically above (by platform+slug) — nothing here is
        hardcoded.
      */}
      {canSubmitOnCategoryPage(profile?.role) && (
        <SubmitVideoForm platform="youtube" categories={[category]} />
      )}

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
              No videos submitted in {category.name}{" "}
              {range === "all" ? "yet." : `in the ${TIME_RANGE_WINDOW_TEXT[range]}.`}
            </CardContent>
          </Card>
        )}
        <LoadMoreLink
          href={`/youtube/${slug}?range=${range}&take=${take + PAGE_SIZE}`}
          hasMore={hasMore}
        />
      </div>
    </div>
  );
}
