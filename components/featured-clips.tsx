import { VideoCard } from "@/components/video-card";
import { UpvoteButton } from "@/components/upvote-button";
import { VideoPlayerProvider } from "@/lib/video-player-context";
import type { Video } from "@/lib/types/database.types";

// Requirement: reuse the exact Top daily clips row component — this
// is not a custom layout, it's the same <VideoCard> (thumbnail from
// video.thumbnail_url on the left, title, streamer name from
// video.broadcaster_name, "{views} views · {time ago}", purple
// #9146FF Twitch badge — all built into VideoCard itself, unchanged)
// wrapped the same way /twitch/[slug]/page.tsx wraps it: inside
// VideoPlayerProvider, with UpvoteButton as the action, official
// categories' showSubmissionCount={false}. Clicking a row's thumbnail
// or title toggles VideoCard's own embed exactly like Top daily clips
// — the "large embed already working" is VideoCard's built-in
// TwitchEmbed, not a separate implementation.
export function FeaturedClips({
  clips,
  upvotedVideoIds,
  isLoggedIn,
}: {
  clips: Video[];
  upvotedVideoIds: Set<string>;
  isLoggedIn: boolean;
}) {
  if (clips.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Featured clips</h2>
      <div className="flex flex-col gap-1.5">
        <VideoPlayerProvider>
          {clips.map((clip) => (
            <VideoCard
              key={clip.id}
              video={clip}
              categoryName="Featured clips"
              showSubmissionCount={false}
              action={
                <UpvoteButton
                  videoId={clip.id}
                  voteCount={clip.vote_count}
                  initialUpvoted={upvotedVideoIds.has(clip.id)}
                  isLoggedIn={isLoggedIn}
                />
              }
            />
          ))}
        </VideoPlayerProvider>
      </div>
    </div>
  );
}
