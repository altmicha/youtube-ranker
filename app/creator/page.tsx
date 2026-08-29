import { requireCreator } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { AwardPointsButton } from "@/components/award-points-button";
import { RemoveVideoButton } from "@/components/remove-video-button";
import { VideoCard } from "@/components/video-card";
import { Card, CardContent } from "@/components/ui/card";
import { VideoPlayerProvider } from "@/lib/video-player-context";

export default async function CreatorDashboardPage() {
  // Access gate: redirects to /login if signed out, or / if not a creator.
  const creator = await requireCreator();

  const supabase = await createClient();
  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .eq("is_removed", false)
    .order("submission_count", { ascending: false })
    .limit(50);

  let alreadyAwardedVideoIds = new Set<string>();
  if (videos && videos.length > 0) {
    const { data: myAwards } = await supabase
      .from("video_creator_awards")
      .select("video_id")
      .eq("creator_id", creator.id)
      .in(
        "video_id",
        videos.map((v) => v.id)
      );
    alreadyAwardedVideoIds = new Set(myAwards?.map((a) => a.video_id));
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Creator dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Award points to the people who submitted a video.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <VideoPlayerProvider>
          {videos?.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              action={
                <div className="flex flex-col items-end gap-2">
                  <AwardPointsButton
                    videoId={video.id}
                    initialAlreadyAwarded={alreadyAwardedVideoIds.has(video.id)}
                  />
                  <RemoveVideoButton videoId={video.id} />
                </div>
              }
            />
          ))}
        </VideoPlayerProvider>
        {(!videos || videos.length === 0) && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No videos have been submitted yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
