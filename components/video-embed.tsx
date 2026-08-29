"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadYoutubeIframeApi, type YTPlayer } from "@/lib/youtube-iframe-api";

export function VideoEmbed({ youtubeId }: { youtubeId: string }) {
  // Stable, DOM-safe id for this specific iframe instance — the
  // IFrame Player API needs an element id/ref to attach to.
  const iframeId = `yt-player-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const playerRef = useRef<YTPlayer | null>(null);
  // Requirement 4: default muted autoplay; the user taps the button
  // below to unmute.
  const [muted, setMuted] = useState(true);
  const [apiReady, setApiReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadYoutubeIframeApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(iframeId, {
        events: {
          onReady: () => {
            if (!cancelled) setApiReady(true);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeId]);

  function toggleSound() {
    const player = playerRef.current;
    if (!player) return;

    if (muted) {
      player.unMute();
      player.setVolume(100);
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  }

  return (
    <div className="border-t p-2">
      {/*
        Requirement 3: taller on mobile portrait. aspect-[4/3] gives
        noticeably more vertical room than 16:9 at typical phone
        widths, so there's comfortable space for the sound button
        below; sm: and up (tablet/desktop — requirement 5) reverts to
        the standard 16:9 video aspect ratio.
      */}
      <div className="aspect-[4/3] w-full overflow-hidden rounded-md bg-black sm:aspect-video">
        <iframe
          id={iframeId}
          className="h-full w-full"
          // enablejsapi=1 + a matching origin is required for the
          // IFrame Player API (postMessage-based) to control this
          // specific embed from our own button. playsinline stops
          // iOS Safari from forcing its own fullscreen native player,
          // which would make that button unreachable.
          src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&playsinline=1&enablejsapi=1&origin=${
            typeof window !== "undefined" ? window.location.origin : ""
          }`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>

      {/*
        Requirement 1/2: our own mute/unmute control, since YouTube's
        built-in volume button is frequently missed or unreachable in
        a cramped mobile-portrait embed. Full width on mobile so it's
        an easy, unambiguous tap target; auto width from sm: up.
      */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={toggleSound}
        disabled={!apiReady}
        className="mt-2 w-full sm:w-auto"
      >
        {muted ? "🔇 Muted — tap for sound" : "🔊 Sound on"}
      </Button>

      {/* Requirement 6: the only thing that navigates away. */}
      <a
        href={`https://www.youtube.com/watch?v=${youtubeId}`}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 block text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        Open on YouTube ↗
      </a>
    </div>
  );
}
