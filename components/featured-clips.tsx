"use client";

import { useState } from "react";
import { TwitchEmbed } from "@/components/twitch-embed";
import type { Video } from "@/lib/types/database.types";

// Reuses TwitchEmbed unmodified (same iframe/parent-params setup as
// everywhere else clips play in this app) — click-to-expand, same as
// VideoCard's pattern, rather than five always-on iframes at once
// (bad for load time and noisy with five autoplaying/loading players).
// Self-contained "which one is open" state rather than the shared
// VideoPlayerProvider context, since this row isn't wrapped in one —
// /streamer/[slug] doesn't render any other embeddable list.
export function FeaturedClips({ clips }: { clips: Video[] }) {
  const [playingId, setPlayingId] = useState<string | null>(null);

  if (clips.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Featured clips</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {clips.map((clip) => (
          <div key={clip.id} className="w-56 flex-shrink-0">
            {playingId === clip.id && clip.twitch_clip_slug ? (
              <TwitchEmbed slug={clip.twitch_clip_slug} />
            ) : (
              <button
                type="button"
                onClick={() => setPlayingId(clip.id)}
                className="block w-full text-left"
              >
                <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                  {clip.thumbnail_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={clip.thumbnail_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-black">
                      ▶
                    </div>
                  </div>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {clip.title ?? "Untitled clip"}
                </p>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
