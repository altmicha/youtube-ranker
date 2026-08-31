import { after } from "next/server";
import { requireCreatorOrStreamer } from "@/lib/auth/roles";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AwardPointsButton } from "@/components/award-points-button";
import { RemoveVideoButton } from "@/components/remove-video-button";
import { VideoCard } from "@/components/video-card";
import { StreamerAndCategorySection } from "@/components/creator/streamer-and-category-section";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { VideoPlayerProvider } from "@/lib/video-player-context";
import { refreshTopDailyClips } from "@/lib/top-daily-clips-refresh";
import { refreshTwitchAvatars } from "@/lib/twitch-avatar-refresh";

export default async function CreatorDashboardPage() {
  // Access gate: redirects to /login if signed out, or / if the
  // viewer is neither a creator nor a streamer. Streamers can reach
  // this page now (to manage their own reaction queue categories),
  // but more sensitive actions (award points, remove videos, add
  // official categories) stay creator-only at the Server Action level
  // regardless — see canManageOfficial below and the various
  // requireCreatorProfile() checks in app/actions/*.ts.
  const profile = await requireCreatorOrStreamer();

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
      .eq("creator_id", profile.id)
      .in(
        "video_id",
        videos.map((v) => v.id)
      );
    alreadyAwardedVideoIds = new Set(myAwards?.map((a) => a.video_id));
  }

  const [
    { data: youtubeCategories },
    { data: twitchCategories },
    { data: streamers },
  ] = await Promise.all([
    supabase.from("categories").select("*").eq("platform", "youtube").order("name"),
    supabase.from("categories").select("*").eq("platform", "twitch").order("name"),
    // One unified list — streamers aren't platform-scoped anymore.
    supabase.from("streamers").select("*").order("display_name"),
  ]);

  // Owner picker candidates for the Streamers form. Fetched via the
  // admin client rather than the normal request-scoped one — a
  // creator's own session may only be able to SELECT their own
  // profiles row under RLS, which would make this list useless for
  // picking anyone else as an owner. Safe to bypass RLS here since
  // this whole page is already gated to creator/streamer roles by
  // requireCreatorOrStreamer() above.
  const admin = createAdminClient();
  const { data: ownerProfiles, error: ownersError } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .order("display_name", { ascending: true, nullsFirst: false });

  if (ownersError) {
    console.error("CreatorDashboardPage: owner profiles query failed", {
      code: ownersError.code,
      message: ownersError.message,
    });
  }

  // Reuse the two category lists already fetched above to build a
  // (source, category slug) -> name lookup — the same pair
  // submit/category pages use. category_id is vestigial/unreliable
  // now, so it's not used for this.
  const categoryNames = new Map(
    [...(youtubeCategories ?? []), ...(twitchCategories ?? [])].map((c) => [
      `${c.platform}::${c.slug}`,
      c.name,
    ])
  );

  // Requirement: refresh Top daily clips when a creator opens
  // /creator (the "if the hourly job isn't possible" fallback) — for
  // every streamer with a twitch_login, not just the one whose
  // category page happens to be open. Scheduled via after() so this
  // page never waits on Twitch; refreshTopDailyClips() itself caps
  // each streamer to once per hour.
  const streamersWithTwitchLogin = (streamers ?? [])
    .filter((s): s is typeof s & { twitch_login: string } => !!s.twitch_login)
    .map((s) => ({ id: s.id, slug: s.slug, twitch_login: s.twitch_login }));

  if (streamersWithTwitchLogin.length > 0) {
    after(() => refreshTopDailyClips(streamersWithTwitchLogin));
    // Requirement: avatar sync also runs from /creator, same
    // twitch_login-only list, its own 1-hour cooldown — see
    // lib/twitch-avatar-refresh.ts.
    after(() => refreshTwitchAvatars(streamersWithTwitchLogin));
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Creator dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Award points to the people who submitted a video, and manage streamers and categories.
        </p>
      </div>

      <StreamerAndCategorySection
        initialStreamers={streamers ?? []}
        initialYoutubeCategories={youtubeCategories ?? []}
        initialTwitchCategories={twitchCategories ?? []}
        canManageOfficial={profile.role === "creator"}
        owners={ownerProfiles ?? []}
      />

      <Separator />

      <div className="flex flex-col gap-3">
        <VideoPlayerProvider>
          {videos?.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              categoryName={video.category ? categoryNames.get(`${video.source}::${video.category}`) ?? null : null}
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
