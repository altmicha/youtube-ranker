import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StreamerCategoryList } from "@/components/streamer-category-list";
import { Separator } from "@/components/ui/separator";
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

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        ← Back home
      </Link>

      {/*
        Compact header: fixed 48x48 circular avatar + name beside it,
        same size for every streamer regardless of whether they have
        an image (placeholder circle matches exactly). Not the large
        hero-style avatar this page used before — inline style used
        alongside the Tailwind classes for the same reason as the
        48x48 dashboard thumbnails in components/creator/category-manager.tsx:
        belt-and-suspenders sizing that can't be affected by anything
        external.
      */}
      <div className="flex items-center gap-3">
        {streamer.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={streamer.avatar_url}
            alt=""
            width={48}
            height={48}
            className="block flex-shrink-0 rounded-full object-cover"
            style={{ width: 48, height: 48, objectFit: "cover" }}
          />
        ) : (
          <div
            className="flex flex-shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
            style={{ width: 48, height: 48 }}
          >
            {streamer.display_name?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <h1 className="text-lg font-semibold tracking-tight">
          {streamer.display_name}
        </h1>
      </div>

      {categoriesError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Could not load categories: {categoriesError.message}
        </p>
      ) : (
        <>
          {/*
            Requirement: official section organized by platform —
            YouTube cards, then Twitch cards, each heading hidden if
            that streamer has no cards there. Still shown first, still
            no top-level "Official" label, matching how this looked
            before this change.
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
