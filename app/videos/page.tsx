import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { VideoCard } from "@/components/video-card";
import { UpvoteButton } from "@/components/upvote-button";
import { Card, CardContent } from "@/components/ui/card";
import { VideoPlayerProvider } from "@/lib/video-player-context";

export default async function AllVideosPage() {
  const [profile, supabase] = [await getCurrentProfile(), await createClient()];

  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .eq("is_removed", false)
    .order("submission_count", { ascending: false })
    .limit(50);

  // Look up display names for whatever categories these videos
  // actually reference, keyed by (source, category slug) — the same
  // pair everything else (submit, category pages, rate limiting) uses
  // now. category_id is vestigial and unreliable, so it's not used
  // here. There are only a handful of categories total, so just fetch
  // them all rather than building a filtered query.
  const { data: allCategories } = await supabase.from("categories").select("platform, slug, name");
  const categoryNames = new Map(allCategories?.map((c) => [`${c.platform}::${c.slug}`, c.name]));

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
          ← Back home
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          All videos
        </h1>
      </div>

      <div className="flex flex-col gap-1.5">
        <VideoPlayerProvider>
          {videos?.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              categoryName={video.category ? categoryNames.get(`${video.source}::${video.category}`) ?? null : null}
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
              No videos submitted yet — be the first!
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
