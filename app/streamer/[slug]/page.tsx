import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StreamerCategoryList } from "@/components/streamer-category-list";
import { FeaturedClips } from "@/components/featured-clips";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { isTopDailyClipsCategory } from "@/lib/top-daily-clips";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types/database.types";

// One platform's cards within a section (official or queue). Hides
// its own heading entirely when there's nothing to show — works for
// any streamer since it's just filtering whatever categories were
// already fetched, nothing hardcoded. Card links themselves are
// untouched — still built by StreamerCategoryList exactly as before.
function PlatformCards({
  platform,
  categories,
}: {
  platform: "youtube" | "twitch";
  categories: Category[];
}) {
  const filtered = categories.filter((c) => c.platform === platform);
  if (filtered.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
        {platform === "youtube" ? "YouTube" : "Twitch"}
      </h3>
      <StreamerCategoryList categories={filtered} />
    </div>
  );
}

export default async function StreamerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // select("*") rather than naming columns explicitly — this app
  // doesn't own the streamers table's exact schema, so this is
  // resilient to columns beyond what's declared in the Streamer type
  // (see lib/types/database.types.ts) existing or not.
  const { data: streamer } = await supabase
    .from("streamers")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!streamer) notFound();

  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("*")
    .eq("streamer_id", streamer.id)
    .order("name");

  if (categoriesError) {
    console.error("StreamerPage: categories query failed", {
      slug,
      streamerId: streamer.id,
      code: categoriesError.code,
      message: categoriesError.message,
    });
  }

  const officialCategories = (categories ?? []).filter((c) => c.kind === "official");
  const queueCategories = (categories ?? []).filter((c) => c.kind === "queue");

  // Requirement: "if this streamer has Top daily clips" — reuses the
  // categories already fetched above rather than a second query.
  // Works for any streamer since it's just checking for a category
  // matching the pattern lib/top-daily-clips.ts's
  // ensureTopDailyClipsCategory() creates, nothing hardcoded.
  const topDailyClipsCategory = officialCategories.find((c) => isTopDailyClipsCategory(c));

  let featuredClips: Awaited<ReturnType<typeof fetchFeaturedClips>> = [];
  if (topDailyClipsCategory) {
    featuredClips = await fetchFeaturedClips(supabase, topDailyClipsCategory.slug);
  }

  // Requirement: watch links built only from twitch_login /
  // youtube_channel_id — nothing hardcoded, buttons simply don't
  // render when the relevant field is unset.
  const twitchUrl = streamer.twitch_login ? `https://www.twitch.tv/${streamer.twitch_login}` : null;
  const youtubeUrl = streamer.youtube_channel_id
    ? `https://www.youtube.com/channel/${streamer.youtube_channel_id}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        ← Back home
      </Link>

      {/*
        Hero: bigger/richer treatment than a plain page header, per
        this being a streamer "promo page" now — avatar, name, LIVE +
        viewer count, bio, and watch buttons together. Same 80x80
        avatar size for every streamer regardless of whether they
        have an image, via inline style alongside the Tailwind classes
        (same belt-and-suspenders pattern used for the 48x48
        dashboard thumbnails in components/creator/category-manager.tsx).
      */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {streamer.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={streamer.avatar_url}
            alt=""
            width={80}
            height={80}
            className="block flex-shrink-0 rounded-full object-cover"
            style={{ width: 80, height: 80, objectFit: "cover" }}
          />
        ) : (
          <div
            className="flex flex-shrink-0 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground"
            style={{ width: 80, height: 80 }}
          >
            {streamer.display_name?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{streamer.display_name}</h1>
            {streamer.is_live && (
              <span className="flex items-center gap-1.5">
                <span className="text-xs font-bold" style={{ color: "#ef4444" }}>
                  LIVE
                </span>
                {streamer.viewer_count != null && (
                  <span className="text-xs text-muted-foreground">
                    viewers {formatCount(streamer.viewer_count)}
                  </span>
                )}
              </span>
            )}
          </div>

          {streamer.bio && <p className="max-w-prose text-sm text-muted-foreground">{streamer.bio}</p>}

          <div className="flex flex-wrap gap-2">
            {twitchUrl && (
              <a
                href={twitchUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: streamer.is_live ? "default" : "outline", size: "sm" }))}
              >
                {streamer.is_live ? "Watch live" : "Watch on Twitch"}
              </a>
            )}
            {youtubeUrl && (
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Watch on YouTube
              </a>
            )}
          </div>
        </div>
      </div>

      <FeaturedClips clips={featuredClips} />

      {categoriesError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Could not load categories: {categoriesError.message}
        </p>
      ) : (
        <>
          {/*
            Official section organized by platform — YouTube cards,
            then Twitch cards, each heading hidden if that streamer
            has no cards there.
          */}
          <div className="flex flex-col gap-4">
            <PlatformCards platform="youtube" categories={officialCategories} />
            <PlatformCards platform="twitch" categories={officialCategories} />
          </div>

          <Separator />

          <div>
            <h2 className="mb-3 text-lg font-semibold">
              Submit videos for your creator to react to
            </h2>
            <div className="flex flex-col gap-4">
              <PlatformCards platform="youtube" categories={queueCategories} />
              <PlatformCards platform="twitch" categories={queueCategories} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

async function fetchFeaturedClips(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categorySlug: string
) {
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .eq("source", "twitch")
    .eq("category", categorySlug)
    .eq("is_removed", false)
    .order("view_count", { ascending: false, nullsFirst: false })
    .limit(5);

  if (error) {
    console.error("StreamerPage: featured clips query failed", {
      categorySlug,
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return data ?? [];
}
