import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, canSubmitOnCategoryPage } from "@/lib/auth/roles";
import { isMyVodsCategory } from "@/lib/my-vods";
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

export default async function YoutubeCategoryPage({
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
  // a queue category can share a slug for the same streamer+platform
  // (see add_category_kind.sql). Default to "official" so every link
  // that predates this feature (none of which ever had a ?kind=)
  // keeps resolving to exactly the category it always did.
  const kind: CategoryKind = sp.kind === "queue" ? "queue" : "official";

  const { data: category } = await supabase
    .from("categories")
    .select("*")
    .eq("platform", "youtube")
    .eq("slug", slug)
    .eq("kind", kind)
    .single();

  if (!category) notFound();

  // Requirement: back link goes to the category's streamer, not the
  // platform page. Looked up dynamically from category.streamer_id —
  // works for any streamer, nothing hardcoded. Falls back to a plain
  // link home if this category has no streamer assigned. owner_id is
  // also selected here (not just for the back link) so the My VODs
  // permission check below can reuse this same row instead of a
  // second query.
  let backHref = "/";
  let backLabel = "← Back home";
  let streamerOwnerId: string | null = null;
  if (category.streamer_id) {
    const { data: streamer } = await supabase
      .from("streamers")
      .select("slug, display_name, owner_id")
      .eq("id", category.streamer_id)
      .single();
    if (streamer) {
      backHref = `/streamer/${streamer.slug}`;
      backLabel = `← Back to ${streamer.display_name}`;
      streamerOwnerId = streamer.owner_id;
    }
  }

  const range = parseTimeRange(sp.range);
  const since = timeRangeSince(range);

  // Requirement: sort filters (views/date/votes, either direction),
  // in addition to the existing time range filter — the two combine:
  // the time range decides which videos qualify, sort decides their
  // order within that set. Default (no ?sort=) is submissions
  // descending, same ranking behavior as before this feature existed
  // for both official and queue categories.
  const { field: sortField, direction: sortDirection } = parseSortParam(sp.sort);

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
    .order(sortOrderColumn(sortField), { ascending: sortDirection === "asc", nullsFirst: false })
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

  // Requirement: "My VODs" has a stricter submit rule than other
  // official categories — only that specific streamer's owner, a
  // creator, or an admin, not any account with the generic "streamer"
  // role. This controls whether the form even shows; submitVideo()
  // independently re-enforces the same rule server-side, so this is
  // only about avoiding showing a form that would just get rejected.
  const canSubmit =
    category.kind === "queue"
      ? !!profile
      : isMyVodsCategory(category)
        ? !!profile &&
          (profile.role === "creator" ||
            profile.role === "admin" ||
            (streamerOwnerId != null && streamerOwnerId === profile.id))
        : canSubmitOnCategoryPage(profile?.role);

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
          <TimeRangeFilter basePath="/youtube" categorySlug={slug} active={range} kind={kind} sort={sp.sort} />
        </div>

        <div className="mt-2">
          <SortFilter
            basePath="/youtube"
            categorySlug={slug}
            range={range}
            kind={kind}
            active={sp.sort}
            showLikeRatio
          />
        </div>

        <p className="mt-1 font-mono text-xs text-muted-foreground">
          filter: source=youtube · category={slug} · kind={kind}
        </p>

        {videosError && (
          <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Could not load videos: {videosError.message}
          </p>
        )}
      </div>

      {/*
        Reuses SubmitVideoForm unmodified, using its lockedCategory
        mode: no category picker, every submission goes straight to
        this exact category (its own platform+kind, already resolved
        above by the dynamic lookup — nothing hardcoded). Official
        categories keep the creator/streamer/admin-only rule, except
        "My VODs" (owner/creator/admin only — see canSubmit above);
        queue categories (kind === "queue") are open to any logged-in
        user — also enforced server-side in submitVideo(), not just
        here.
      */}
      {canSubmit && <SubmitVideoForm platform="youtube" lockedCategory={category} />}

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
              No videos submitted in {category.name}{" "}
              {range === "all" ? "yet." : `in the ${TIME_RANGE_WINDOW_TEXT[range]}.`}
            </CardContent>
          </Card>
        )}
        <LoadMoreLink
          href={`/youtube/${slug}?range=${range}&take=${take + PAGE_SIZE}${sp.sort ? `&sort=${sp.sort}` : ""}${kind === "queue" ? "&kind=queue" : ""}`}
          hasMore={hasMore}
        />
      </div>
    </div>
  );
}
