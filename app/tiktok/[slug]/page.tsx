import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, canSubmitOnCategoryPage } from "@/lib/auth/roles";
import { VideoCard } from "@/components/video-card";
import { UpvoteButton } from "@/components/upvote-button";
import { TimeRangeFilter } from "@/components/time-range-filter";
import { SortFilter } from "@/components/sort-filter";
import { LoadMoreLink, PAGE_SIZE } from "@/components/load-more-link";
import { SubmitVideoForm } from "@/components/submit-video-form";
import { Card, CardContent } from "@/components/ui/card";
import { parseTimeRange, timeRangeSince, TIME_RANGE_WINDOW_TEXT } from "@/lib/time-range";
import { VideoPlayerProvider } from "@/lib/video-player-context";
import { filterVideosByTimeWindow, parseSortParam, sortVideos, sortOrderColumn } from "@/lib/rank-videos";
import type { CategoryKind } from "@/lib/types/database.types";

// No Top daily clips / Featured clips equivalent for TikTok — per
// this feature's own requirement ("no auto top daily TikToks"), so
// unlike the Twitch category page, there's no isTopDailyClips
// special-casing here at all: no hidden time-range picker, no
// restricted sort options, no background refresh scheduling. This is
// otherwise the same structure/filters as YouTube and Twitch.
export default async function TiktokCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; take?: string; kind?: string; sort?: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const sp = await searchParams;
  // (platform, slug) is no longer unique on its own — an official and
  // a queue category can share a slug for the same streamer+platform.
  // Default to "official" so a link with no ?kind= resolves to that.
  const kind: CategoryKind = sp.kind === "queue" ? "queue" : "official";

  const { data: category } = await supabase
    .from("categories")
    .select("*")
    .eq("platform", "tiktok")
    .eq("slug", slug)
    .eq("kind", kind)
    .single();

  if (!category) notFound();

  // Back link goes to the category's streamer, not the platform page
  // — looked up dynamically from category.streamer_id, works for any
  // streamer, nothing hardcoded. Falls back to a plain link home if
  // this category has no streamer assigned.
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

  const range = parseTimeRange(sp.range);
  const since = timeRangeSince(range);
  const { field: sortField, direction: sortDirection } = parseSortParam(sp.sort);

  const requestedTake = parseInt(sp.take ?? "", 10);
  const take = Number.isFinite(requestedTake) && requestedTake > PAGE_SIZE
    ? Math.min(requestedTake, 500)
    : PAGE_SIZE;

  const profile = await getCurrentProfile();

  const { data: baseVideos, error: videosError } = await supabase
    .from("videos")
    .select("*")
    .eq("source", "tiktok")
    .eq("category", slug)
    .eq("is_removed", false)
    .order(sortOrderColumn(sortField), { ascending: sortDirection === "asc", nullsFirst: false })
    .limit(take);

  if (videosError) {
    console.error("TiktokCategoryPage: videos query failed", {
      slug,
      code: videosError.code,
      message: videosError.message,
    });
  }

  const hasMore = (baseVideos?.length ?? 0) === take;

  const windowedVideos = await filterVideosByTimeWindow(supabase, baseVideos ?? [], since);
  const videos = sortVideos(windowedVideos, sortField, sortDirection);

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
          <TimeRangeFilter basePath="/tiktok" categorySlug={slug} active={range} kind={kind} sort={sp.sort} />
        </div>

        <div className="mt-2">
          <SortFilter basePath="/tiktok" categorySlug={slug} range={range} kind={kind} active={sp.sort} />
        </div>

        <p className="mt-1 font-mono text-xs text-muted-foreground">
          filter: source=tiktok · category={slug} · kind={kind}
        </p>

        {videosError && (
          <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Could not load videos: {videosError.message}
          </p>
        )}
      </div>

      {/* Requirement: official — creator/streamer/admin only. Queue —
          any logged-in user. Enforced again, server-side, in
          submitVideo() — this only controls whether the form shows. */}
      {(category.kind === "queue" ? !!profile : canSubmitOnCategoryPage(profile?.role)) && (
        <SubmitVideoForm platform="tiktok" lockedCategory={category} />
      )}

      <div className="flex flex-col gap-1.5">
        <VideoPlayerProvider>
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              categoryName={category.name}
              // Same convention as YouTube/Twitch: official categories
              // don't show the submission tracker, queue categories
              // keep it.
              showSubmissionCount={category.kind === "queue"}
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
          href={`/tiktok/${slug}?range=${range}&take=${take + PAGE_SIZE}${sp.sort ? `&sort=${sp.sort}` : ""}${kind === "queue" ? "&kind=queue" : ""}`}
          hasMore={hasMore}
        />
      </div>
    </div>
  );
}
