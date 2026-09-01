"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Video } from "@/lib/types/database.types";
import { formatCount } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relative-time";
import { useVideoPlayer } from "@/lib/video-player-context";
import { VideoEmbed } from "@/components/video-embed";
import { TwitchEmbed } from "@/components/twitch-embed";
import { TiktokEmbed } from "@/components/tiktok-embed";

export function VideoCard({
  video,
  categoryName,
  action,
  showSubmissionCount = true,
}: {
  video: Video;
  // Passed explicitly rather than read off `video` — the ranked-list
  // RPC returns a joined category_name, but plain `.select("*")`
  // queries (e.g. /videos, /creator) don't include it automatically,
  // so each caller supplies whatever it already knows/fetched. Null
  // (or omitted) means the video has no category (was removed, or
  // never categorized) — shown as "Uncategorized".
  categoryName?: string | null;
  action: React.ReactNode;
  // Defaults to true, preserving existing behavior everywhere this
  // component is already used (/videos, /creator, etc). Only the
  // official-category path on /youtube/[slug] and /twitch/[slug]
  // passes false — official categories no longer show the "N subs"
  // tracker, while queue categories (and every other page) keep it.
  showSubmissionCount?: boolean;
}) {
  const { playingId, toggle } = useVideoPlayer();
  const isPlaying = playingId === video.id;
  const isTwitch = video.source === "twitch";
  const isTiktok = video.source === "tiktok";

  // Channel-equivalent label and a fallback title, source-aware:
  // YouTube videos have channel_name/youtube_id, Twitch clips have
  // broadcaster_name/twitch_clip_slug, TikTok videos reuse
  // broadcaster_name for the author's name and have tiktok_video_id —
  // never more than one of the three id columns set on a given row.
  const attributionName = isTwitch || isTiktok ? video.broadcaster_name : video.channel_name;
  const fallbackTitle = isTwitch
    ? `twitch.tv clip: ${video.twitch_clip_slug}`
    : isTiktok
      ? `tiktok.com video: ${video.tiktok_video_id}`
      : `youtube.com/watch?v=${video.youtube_id}`;

  // Requirement 4 (view/like/dislike, YouTube feature): only include
  // a stat if the API actually returned it — dislikeCount is almost
  // always null (YouTube hid it publicly in Dec 2021), view/like can
  // be null if the stats fetch failed, and Twitch clips never have
  // like/dislike counts at all (Get Clips doesn't return them). Never
  // show a fabricated 0. Upload/creation age is appended to the same
  // line for both sources and is likewise only shown once actually
  // fetched.
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
            this card instead of leaving the site. */}
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
              loading="lazy"
              decoding="async"
              className="h-10 w-[72px] flex-shrink-0 rounded object-cover sm:h-12 sm:w-[85px]"
            />
          ) : (
            <div className="flex h-10 w-[72px] flex-shrink-0 items-center justify-center rounded bg-muted text-[9px] text-muted-foreground sm:h-12 sm:w-[85px]">
              No thumb
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-xs font-medium leading-snug hover:underline sm:text-sm">
              {video.title ?? fallbackTitle}
            </p>
            {attributionName && (
              <p className="truncate text-[11px] text-muted-foreground">
                {attributionName}
              </p>
            )}
            {stats.length > 0 && (
              <p className="truncate text-[11px] text-muted-foreground">
                {stats.join(" · ")}
              </p>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-1">
              {isTwitch && (
                <Badge className="border-transparent bg-[#9146FF] px-1.5 py-0 text-[10px] text-white">
                  Twitch
                </Badge>
              )}
              {isTiktok && (
                <Badge className="border-transparent bg-black px-1.5 py-0 text-[10px] text-white">
                  TikTok
                </Badge>
              )}
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {categoryName ?? "Uncategorized"}
              </Badge>
              {showSubmissionCount && (
                <Badge variant="muted" className="px-1.5 py-0 font-mono text-[10px]">
                  {video.submission_count}{" "}
                  {video.submission_count === 1 ? "sub" : "subs"}
                </Badge>
              )}
              <Badge variant="muted" className="px-1.5 py-0 font-mono text-[10px]">
                {video.vote_count} {video.vote_count === 1 ? "vote" : "votes"}
              </Badge>
            </div>
          </div>
        </button>

        <div className="flex-shrink-0">{action}</div>
      </div>

      {isPlaying &&
        (isTwitch ? (
          // Same toggle() already used for click-to-open — closing via
          // the X button just calls it again, identical to clicking
          // the thumbnail/title a second time.
          <TwitchEmbed slug={video.twitch_clip_slug!} onClose={() => toggle(video.id)} />
        ) : isTiktok ? (
          <TiktokEmbed
            videoId={video.tiktok_video_id!}
            videoUrl={`https://www.tiktok.com/video/${video.tiktok_video_id}`}
            onClose={() => toggle(video.id)}
          />
        ) : (
          <VideoEmbed youtubeId={video.youtube_id!} />
        ))}
    </Card>
  );
}
