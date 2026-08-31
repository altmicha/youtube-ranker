import { notFound } from "next/navigation";
import Link from "next/link";
import { after } from "next/server";
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
import { isTopDailyClipsCategory } from "@/lib/top-daily-clips";
import { refreshTopDailyClips } from "@/lib/top-daily-clips-refresh";
import type { CategoryKind } from "@/lib/types/database.types";

export default async function TwitchCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; take?: string; kind?: string; sort?: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const sp = await searchParams;
  // (platform, slug) is no longer unique on its own — see
  // add_category_kind.sql. Default to "official" so every link that
  // predates this feature keeps resolving to what it always did.
  const kind: CategoryKind = sp.kind === "queue" ? "queue" : "official";

  const { data: category } = await supabase
    .from("categories")
    .select("*")
    .eq("platform", "twitch")
    .eq("slug", slug)
    .eq("kind", kind)
    .single();

  if (!category) notFound();

  const isTopDailyClips = isTopDailyClipsCategory(category);

  // Requirement: refresh this streamer's Top daily clips when their
  // category page loads (the "if the hourly job isn't possible"
  // fallback) — scheduled via after() so this page never waits on
  // Twitch; refreshTopDailyClips() itself enforces the once-per-hour
  // cap per streamer.
  if (isTopDailyClips && category.streamer_id) {
    const { data: owningStreamer } = await supabase
      .from("streamers")
      .select("id, slug, twitch_login")
      .eq("id", category.streamer_id)
      .single();
    if (owningStreamer?.twitch_login) {
      after(() =>
        refreshTopDailyClips([
          { id: owningStreamer.id, slug: owningStreamer.slug, twitch_login: owningStreamer.twitch_login! },
        ])
      );
    }
  }

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

  const range = parseTimeRange(sp.range);
  // Requirement: Top daily clips are never filtered by the 24h Twitch
  // fetch window (or any time range) in the UI — the 24h window only
  // applies to what refreshTopDailyClips() fetches FROM Twitch. This
  // page always shows whatever's currently stored in the category,
  // regardless of any ?range= a hand-edited URL might still carry
  // (the time range picker itself is hidden below for this category).
  const since = isTopDailyClips ? null : timeRangeSince(range);

  // Requirement: only "Most views" and "Most votes" survive as sort
  // options on Top daily clips pages, and the default (no ?sort=) is
  // views descending here — everywhere else, the default stays
  // submissions descending, untouched.
  const { field: sortField, direction: sortDirection } = isTopDailyClips
    ? sp.sort
      ? parseSortParam(sp.sort)
      : { field: "views" as const, direction: "desc" as const }
    : parseSortParam(sp.sort);

  const requestedTake = parseInt(sp.take ?? "", 10);
  const take = Number.isFinite(requestedTake) && requestedTake > PAGE_SIZE
    ? Math.min(requestedTake, 500)
    : PAGE_SIZE;

  const profile = await getCurrentProfile();

  const { data: baseVideos, error: videosError } = await supabase
    .from("videos")
    .select("*")
    .eq("source", "twitch")
    .eq("category", slug)
    .eq("is_removed", false)
    .order(sortOrderColumn(sortField), { ascending: sortDirection === "asc", nullsFirst: false })
    .limit(take);

  if (videosError) {
    console.error("TwitchCategoryPage: videos query failed", {
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
          {/* Requirement: no Daily/Weekly/Monthly/All time picker on
              Top daily clips — there's nothing to filter by time
              range here, the category always just shows whatever's
              currently stored. */}
          {!isTopDailyClips && (
            <TimeRangeFilter basePath="/twitch" categorySlug={slug} active={range} kind={kind} sort={sp.sort} />
          )}
        </div>

        <div className="mt-2">
          <SortFilter
            basePath="/twitch"
            categorySlug={slug}
            range={range}
            kind={kind}
            active={sp.sort ?? (isTopDailyClips ? "views_desc" : undefined)}
            restrictTo={isTopDailyClips ? ["views_desc", "votes_desc"] : undefined}
          />
        </div>

        <p className="mt-1 font-mono text-xs text-muted-foreground">
          filter: source=twitch · category={slug} · kind={kind}
        </p>

        {videosError && (
          <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Could not load videos: {videosError.message}
          </p>
        )}
      </div>

      {/* See app/youtube/[slug]/page.tsx for the same pattern and
          rationale — lockedCategory mode removes the picker entirely;
          official vs queue still determines who can see this form,
          enforced server-side too, not just here. Requirement: no
          user submission at all on the auto-populated Top daily
          clips category, regardless of role. */}
      {!isTopDailyClips &&
        (category.kind === "queue" ? !!profile : canSubmitOnCategoryPage(profile?.role)) && (
          <SubmitVideoForm platform="twitch" lockedCategory={category} />
        )}

      <div className="flex flex-col gap-1.5">
        <VideoPlayerProvider>
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              categoryName={category.name}
              // Requirement: official categories don't show the
              // submission tracker; queue categories keep it.
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
              {isTopDailyClips
                ? `No clips in ${category.name} yet.`
                : `No clips submitted in ${category.name} ${
                    range === "all" ? "yet." : `in the ${TIME_RANGE_WINDOW_TEXT[range]}.`
                  }`}
            </CardContent>
          </Card>
        )}
        <LoadMoreLink
          href={`/twitch/${slug}?range=${range}&take=${take + PAGE_SIZE}${sp.sort ? `&sort=${sp.sort}` : ""}${kind === "queue" ? "&kind=queue" : ""}`}
          hasMore={hasMore}
        />
      </div>
    </div>
  );
}
