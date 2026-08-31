import { notFound } from "next/navigation";
import Link from "next/link";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { StreamerCategoryList } from "@/components/streamer-category-list";
import { StreamerHero } from "@/components/streamer-hero";
import { Separator } from "@/components/ui/separator";
import { isFeaturedClipsCategory } from "@/lib/featured-clips";
import { refreshFeaturedClips } from "@/lib/featured-clips-refresh";
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

  // Requirement: Featured clips is a completely separate data source
  // from Top daily clips — its own category (lib/featured-clips.ts),
  // its own 30-day Twitch fetch, its own refresh job. Reuses the
  // categories already fetched above rather than a second query.
  // Works for any streamer since it's just checking for a category
  // matching the pattern ensureFeaturedClipsCategory() creates,
  // nothing hardcoded.
  const featuredClipsCategory = officialCategories.find((c) => isFeaturedClipsCategory(c));

  let featuredClips: Awaited<ReturnType<typeof fetchFeaturedClips>> = [];
  if (featuredClipsCategory) {
    featuredClips = await fetchFeaturedClips(supabase, featuredClipsCategory.slug);
  }

  // Requirement fix: the category can exist (e.g. just recreated by
  // ensureFeaturedClipsCategory()) while genuinely having zero clips
  // in it yet — the routine background refresh below is cooldown-
  // limited per streamer, not per "does this category actually have
  // clips", so a stale in-memory cooldown timestamp from before a
  // reset could leave it empty indefinitely. When that's the case,
  // force a synchronous refresh just this once (bypassing the
  // cooldown) so this very page load has something to show, then
  // re-read what actually got stored.
  if (featuredClipsCategory && featuredClips.length === 0 && streamer.twitch_login) {
    await refreshFeaturedClips(
      [{ id: streamer.id, slug: streamer.slug, twitch_login: streamer.twitch_login }],
      { force: true }
    );
    featuredClips = await fetchFeaturedClips(supabase, featuredClipsCategory.slug);
  }

  // Refresh on page load (this page has no other trigger point) —
  // scheduled via after() so the page never waits on Twitch; capped
  // to once per streamer per hour by refreshFeaturedClips() itself.
  // Redundant with the forced refresh right above when that just ran
  // (it already recorded this streamer as refreshed), so this simply
  // no-ops in that case rather than doing the work twice.
  if (streamer.twitch_login) {
    after(() =>
      refreshFeaturedClips([{ id: streamer.id, slug: streamer.slug, twitch_login: streamer.twitch_login! }])
    );
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

      <StreamerHero
        displayName={streamer.display_name}
        avatarUrl={streamer.avatar_url}
        bio={streamer.bio}
        isLive={!!streamer.is_live}
        viewerCount={streamer.viewer_count}
        twitchUrl={twitchUrl}
        youtubeUrl={youtubeUrl}
        featuredClips={featuredClips}
      />

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
