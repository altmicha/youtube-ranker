import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StreamerCategoryList } from "@/components/streamer-category-list";

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

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        ← Back home
      </Link>

      <div className="flex items-center gap-4">
        {streamer.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={streamer.avatar_url}
            alt=""
            className="h-16 w-16 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold text-muted-foreground">
            {streamer.display_name?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {streamer.display_name}
          </h1>
          {/* Streamers aren't platform-scoped anymore (they can have
              both YouTube and Twitch categories, shown together
              below), so a single-platform label here would be
              inaccurate or stale — removed. */}
        </div>
      </div>

      {categoriesError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Could not load categories: {categoriesError.message}
        </p>
      ) : (
        <StreamerCategoryList categories={categories ?? []} />
      )}
    </div>
  );
}
