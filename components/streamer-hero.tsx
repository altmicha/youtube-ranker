"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { TwitchEmbed } from "@/components/twitch-embed";
import { formatCount } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/types/database.types";

interface StreamerHeroProps {
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  isLive: boolean;
  viewerCount: number | null;
  twitchUrl: string | null;
  youtubeUrl: string | null;
  featuredClips: Video[];
}

// Matches the transition-duration used on the embed block's className
// below — the setTimeout that actually removes it from the DOM has to
// agree with how long the CSS fade-out takes, or it'd either flash
// (removed too early) or leave a dead pause (removed too late).
const FADE_MS = 200;

// One client component owns both the compact clip list (constrained
// to the right column, ~420px) AND the full-width embed area below
// the whole hero — a plain Server Component split across two JSX
// positions couldn't do that, since the embed needs to escape the
// narrow column's width entirely rather than render inside it or
// inside a single row (which is what made it "tiny" two turns ago).
export function StreamerHero({
  displayName,
  avatarUrl,
  bio,
  isLive,
  viewerCount,
  twitchUrl,
  youtubeUrl,
  featuredClips,
}: StreamerHeroProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playingClip = featuredClips.find((c) => c.id === playingId && c.twitch_clip_slug);

  // Requirement 1: clicking the same clip again closes it. Requirement:
  // "only one plays at a time" is already structural here (playingId
  // holds a single value, not a set), so selecting a different clip
  // always replaces whichever was playing rather than adding to it.
  function toggle(id: string) {
    setPlayingId((current) => (current === id ? null : id));
  }

  // Fade in/out without a library: conditionally rendering
  // {playingClip && <Card>...} unmounts the instant playingClip
  // becomes null — before any CSS transition can play, since React
  // removes the DOM node immediately rather than waiting on it. So
  // "which clip is actually in the DOM" (mountedClip) is tracked
  // separately from "should it be visible right now" (faded) — closing
  // flips faded to false first (starts the CSS opacity transition),
  // then a timeout matching that same duration clears mountedClip
  // (finishes the unmount, leaving no empty box behind). Opening does
  // the reverse: mount first, then flip to visible on the next paint
  // so the browser actually has an opacity:0 state to transition from.
  const [mountedClip, setMountedClip] = useState<typeof playingClip>(undefined);
  const [faded, setFaded] = useState(false);

  useEffect(() => {
    if (playingClip) {
      setMountedClip(playingClip);
      const raf = requestAnimationFrame(() => setFaded(true));
      return () => cancelAnimationFrame(raf);
    }
    setFaded(false);
    const timeout = setTimeout(() => setMountedClip(undefined), FADE_MS);
    return () => clearTimeout(timeout);
  }, [playingClip]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left column: avatar/name/live/bio/watch buttons — same
            markup/sizing as before this turn, untouched otherwise. */}
        <div className="flex flex-col gap-3 sm:flex-1 sm:flex-row sm:items-start">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              width={80}
              height={80}
              className="block flex-shrink-0 rounded-full object-cover"
              style={{ width: 80, height: 80, objectFit: "cover" }}
            />
          ) : (
            <div
              className="flex flex-shrink-0 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground"
              style={{ width: 80, height: 80 }}
            >
              {displayName?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
              {isLive && (
                <span className="flex items-center gap-1.5">
                  <span className="text-xs font-bold" style={{ color: "#ef4444" }}>
                    LIVE
                  </span>
                  {viewerCount != null && (
                    <span className="text-xs text-muted-foreground">
                      viewers {formatCount(viewerCount)}
                    </span>
                  )}
                </span>
              )}
            </div>

            {bio && <p className="max-w-prose text-sm text-muted-foreground">{bio}</p>}

            <div className="flex flex-wrap gap-2">
              {twitchUrl && (
                <a
                  href={twitchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: isLive ? "default" : "outline", size: "sm" }))}
                >
                  {isLive ? "Watch live" : "Watch on Twitch"}
                </a>
              )}
              {youtubeUrl && (
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Watch on YouTube
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Right column: compact Featured clips list, capped at
            ~420px — never full page width, never the visual center of
            the hero. */}
        {featuredClips.length > 0 && (
          <div className="w-full sm:w-[420px] sm:max-w-[420px] sm:flex-shrink-0">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Featured clips</h2>
            <div className="flex flex-col gap-1.5">
              {featuredClips.map((clip) => {
                const stats = [
                  clip.view_count != null && `${formatCount(clip.view_count)} views`,
                  clip.published_at != null && formatRelativeTime(clip.published_at),
                ].filter(Boolean) as string[];

                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => toggle(clip.id)}
                    aria-pressed={playingId === clip.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md border p-1.5 text-left transition-colors hover:bg-muted",
                      playingId === clip.id && "border-primary"
                    )}
                  >
                    {/* Same thumbnail size VideoCard uses, for visual
                        consistency — this is still a compact row, not
                        a full VideoCard. */}
                    {clip.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={clip.thumbnail_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-10 w-[72px] flex-shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-[72px] flex-shrink-0 items-center justify-center rounded bg-muted text-[9px] text-muted-foreground">
                        No thumb
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-xs font-medium leading-snug">
                        {clip.title ?? `twitch.tv clip: ${clip.twitch_clip_slug}`}
                      </p>
                      {stats.length > 0 && (
                        <p className="truncate text-[11px] text-muted-foreground">{stats.join(" · ")}</p>
                      )}
                      <Badge className="mt-0.5 border-transparent bg-[#9146FF] px-1.5 py-0 text-[10px] text-white">
                        Twitch
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Requirement: the large embed opens below the WHOLE hero (not
          inside the narrow column, not inline in a compact row), at
          the same size/component Top daily clips uses — TwitchEmbed
          inside a full-width Card, unchanged from that page.
          Requirement 3: fades in on open, fades out on close (via
          either the re-click toggle above or the X button inside
          TwitchEmbed), and never leaves an empty box afterward — see
          the mountedClip/faded state and comment above. */}
      {mountedClip && (
        <Card
          className={cn(
            "overflow-hidden transition-opacity duration-200",
            faded ? "opacity-100" : "opacity-0"
          )}
        >
          <TwitchEmbed slug={mountedClip.twitch_clip_slug!} onClose={() => setPlayingId(null)} />
        </Card>
      )}
    </div>
  );
}
