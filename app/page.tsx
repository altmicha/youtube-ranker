import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { SubmitVideoForm } from "@/components/submit-video-form";
import { UpvoteButton } from "@/components/upvote-button";
import { VideoCard } from "@/components/video-card";
import { CategoryGrid } from "@/components/category-grid";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TRENDING_PREVIEW_LIMIT = 5;

export default async function HomePage() {
  const [profile, supabase] = [await getCurrentProfile(), await createClient()];

  // Small preview only — the full ranked list lives on /videos and
  // each /category/<slug> page, so the homepage stays focused on
  // browsing by category instead of forcing a scroll past a long list.
  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .eq("is_removed", false)
    .order("submission_count", { ascending: false })
    .limit(TRENDING_PREVIEW_LIMIT);

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
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Browse categories
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a category to see its ranked videos, or submit a link below.
        </p>
      </div>

      <CategoryGrid />

      {profile ? (
        <SubmitVideoForm />
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Log in to submit a video and vote.
            </p>
            <Link href="/login" className={cn(buttonVariants())}>
              Log in
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Trending now
          </h2>
          <Link
            href="/videos"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            View all videos →
          </Link>
        </div>

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
