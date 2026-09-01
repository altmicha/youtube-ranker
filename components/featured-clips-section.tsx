"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TwitchEmbed } from "@/components/twitch-embed";
import { formatCount } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/types/database.types";

// Extracted out of components/streamer-hero.tsx — streamers.layout
// treats "hero" and "featured" as two independently orderable/
// hideable sections, so they can no longer be fused into one
// component the way they were. Compact list (capped at ~420px),
// re-click toggle, X-button close, and fade in/out with no empty box
// left behind are all unchanged from before. The embed itself now
// opens as a centered modal overlay instead of an inline block below
// the list — see the render section at the bottom — so watching a
// clip and picking another doesn't require scrolling down and back up.
const FADE_MS = 200;

export function FeaturedClipsSection({ clips }: { clips: Video[] }) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playingClip = clips.find((c) => c.id === playingId && c.twitch_clip_slug);

  function toggle(id: string) {
    setPlayingId((current) => (current === id ? null : id));
  }

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

  if (clips.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full sm:w-[420px] sm:max-w-[420px]">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Featured clips</h2>
        <div className="flex flex-col gap-1.5">
          {clips.map((clip) => {
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

      {/* Requirement: overlay stays fullscreen and dimmed — only the
          player box itself is sized down here, via inline style
          (75vw, max-width 1100px isn't a standard Tailwind scale
          value, so a utility class can't express it exactly; this
          also sidesteps any risk of a Tailwind class not being
          generated for a non-standard size). Backdrop click closes
          it; the X inside TwitchEmbed also closes it (same onClose it
          already had); clicking the player box itself does not close
          it (stopPropagation). Fade in/out timing unchanged. */}
      {mountedClip && (
        <div
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200",
            faded ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setPlayingId(null)}
        >
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative z-10"
            style={{ width: "75vw", maxWidth: "1100px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="overflow-hidden">
              <TwitchEmbed slug={mountedClip.twitch_clip_slug!} onClose={() => setPlayingId(null)} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
