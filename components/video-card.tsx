"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Video } from "@/lib/types/database.types";
import { formatCount } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relative-time";
import { useVideoPlayer } from "@/lib/video-player-context";
import { VideoEmbed } from "@/components/video-embed";

export function VideoCard({
  video,
  action,
}: {
  video: Video;
  action: React.ReactNode;
}) {
  const { playingId, toggle } = useVideoPlayer();
  const isPlaying = playingId === video.id;

  // Requirement 4 (view/like/dislike): only include a stat if the API
  // actually returned it — dislikeCount is almost always null
  // (YouTube hid it publicly in Dec 2021), and view/like can be null
  // if the stats fetch failed at submission time. Never show a
  // fabricated 0. Upload age is appended to the same line and is
  // likewise only shown once actually fetched — old videos stay
  // blank until resubmitted.
  const stats = [
    video.view_count != null && `${formatCount(video.view_count)} views`,
    video.like_count != null && `${formatCount(video.like_count)} likes`,
    video.dislike_count != null && `${formatCount(video.dislike_count)} dislikes`,
    video.published_at != null && formatRelativeTime(video.published_at),
  ].filter(Boolean) as string[];

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-sm">
      <div className="flex items-center gap-2.5 p-2">
        {/* Clicking the thumbnail or title expands the embed below
            this card instead of leaving the site — requirement 2. */}
        <button
          type="button"
          onClick={() => toggle(video.id)}
          aria-expanded={isPlaying}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          {video.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.thumbnail_url}
              alt=""
              className="h-10 w-[72px] flex-shrink-0 rounded object-cover sm:h-12 sm:w-[85px]"
            />
          ) : (
            <div className="flex h-10 w-[72px] flex-shrink-0 items-center justify-center rounded bg-muted text-[9px] text-muted-foreground sm:h-12 sm:w-[85px]">
              No thumb
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-xs font-medium leading-snug hover:underline sm:text-sm">
              {video.title ?? `youtube.com/watch?v=${video.youtube_id}`}
            </p>
            {video.channel_name && (
              <p className="truncate text-[11px] text-muted-foreground">
                {video.channel_name}
              </p>
            )}
            {stats.length > 0 && (
              <p className="truncate text-[11px] text-muted-foreground">
                {stats.join(" · ")}
              </p>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {video.category}
              </Badge>
              <Badge variant="muted" className="px-1.5 py-0 font-mono text-[10px]">
                {video.submission_count}{" "}
                {video.submission_count === 1 ? "sub" : "subs"}
              </Badge>
              <Badge variant="muted" className="px-1.5 py-0 font-mono text-[10px]">
                {video.vote_count} {video.vote_count === 1 ? "vote" : "votes"}
              </Badge>
            </div>
          </div>
        </button>

        <div className="flex-shrink-0">{action}</div>
      </div>

      {isPlaying && <VideoEmbed youtubeId={video.youtube_id} />}
    </Card>
  );
}
