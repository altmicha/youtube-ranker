import { requireCreator } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { AwardPointsButton } from "@/components/award-points-button";

export default async function CreatorDashboardPage() {
  // Feature 2/7: this is the actual access gate. requireCreator()
  // redirects to /login if signed out, or / if signed in but not a
  // creator — a regular user can never render this page's content,
  // regardless of what URL they type.
  const creator = await requireCreator();

  const supabase = await createClient();
  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .order("submission_count", { ascending: false })
    .limit(50);

  // Feature 1/2: know up front which of these videos this creator has
  // already awarded, so the button can render disabled/"Already
  // awarded" on first paint instead of only failing after a click.
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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-xl font-semibold">Creator dashboard</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Award points to the people who submitted a video.
      </p>

      <ul className="flex flex-col gap-3">
        {videos?.map((video) => (
          <li
            key={video.id}
            className="flex items-center gap-4 rounded-md border p-3"
          >
            <div className="flex w-20 flex-col items-center">
              <span className="text-lg font-semibold">
                {video.submission_count}
              </span>
              <span className="text-xs text-muted-foreground">
                {video.submission_count === 1 ? "submission" : "submissions"}
              </span>
            </div>
            <div className="flex w-16 flex-col items-center">
              <span className="text-lg font-semibold">{video.vote_count}</span>
              <span className="text-xs text-muted-foreground">
                {video.vote_count === 1 ? "vote" : "votes"}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <a
                href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3"
              >
                {video.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.thumbnail_url}
                    alt=""
                    className="h-14 w-24 flex-shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-24 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-muted-foreground">
                    No thumbnail
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-blue-600 hover:underline">
                    {video.title ?? `youtube.com/watch?v=${video.youtube_id}`}
                  </p>
                  {video.channel_name && (
                    <p className="truncate text-sm text-muted-foreground">
                      {video.channel_name}
                    </p>
                  )}
                </div>
              </a>
            </div>

            <AwardPointsButton
              videoId={video.id}
              initialAlreadyAwarded={alreadyAwardedVideoIds.has(video.id)}
            />
          </li>
        ))}
        {(!videos || videos.length === 0) && (
          <p className="text-sm text-muted-foreground">
            No videos have been submitted yet.
          </p>
        )}
      </ul>
    </div>
  );
}
