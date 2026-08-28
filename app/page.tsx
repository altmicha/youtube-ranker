import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { SubmitVideoForm } from "@/components/submit-video-form";
import { UpvoteButton } from "@/components/upvote-button";

export default async function HomePage() {
  const [profile, supabase] = [await getCurrentProfile(), await createClient()];

  // Feature 6/4: ranked by submission_count desc, vote_count shown per video.
  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .order("submission_count", { ascending: false })
    .limit(50);

  // Figure out which of these videos the current user has already
  // upvoted, so the button renders as "Upvoted" (disabled) on load
  // instead of flashing "Upvote" first. One query, not N.
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
    <div className="mx-auto max-w-2xl px-4 py-8">
      {profile ? (
        <SubmitVideoForm />
      ) : (
        <p className="mb-8 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-blue-600">
            Sign in
          </Link>{" "}
          to submit a video.
        </p>
      )}

      <h1 className="mb-4 text-xl font-semibold">Most-submitted videos</h1>

      <ul className="flex flex-col gap-3">
        {videos?.map((video) => (
          <li
            key={video.id}
            className="flex items-center gap-4 rounded-md border p-3"
          >
            <div className="flex w-16 flex-col items-center">
              <span className="text-lg font-semibold">
                {video.submission_count}
              </span>
              <span className="text-xs text-muted-foreground">
                {video.submission_count === 1 ? "submission" : "submissions"}
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

            <UpvoteButton
              videoId={video.id}
              voteCount={video.vote_count}
              initialUpvoted={upvotedVideoIds.has(video.id)}
              isLoggedIn={!!profile}
            />
          </li>
        ))}
        {(!videos || videos.length === 0) && (
          <p className="text-sm text-muted-foreground">
            No videos submitted yet — be the first!
          </p>
        )}
      </ul>
    </div>
  );
}
