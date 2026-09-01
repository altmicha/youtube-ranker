"use client";

import { useEffect } from "react";

// TikTok's official embed method: a <blockquote class="tiktok-embed">
// that https://www.tiktok.com/embed.js scans the page for and
// replaces in place with an actual player iframe — this plays inline,
// it never navigates the page away. There's no documented React-
// specific reload hook for that script, so a fresh <script> tag is
// appended each time this mounts, which is what reliably triggers it
// to (re)process a newly-mounted blockquote in a client-rendered app.
export function TiktokEmbed({
  videoId,
  videoUrl,
  onClose,
}: {
  videoId: string;
  videoUrl: string;
  onClose?: () => void;
}) {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://www.tiktok.com/embed.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [videoId]);

  return (
    <div className="relative border-t p-2">
      <div className="mx-auto" style={{ maxWidth: 605 }}>
        <blockquote
          className="tiktok-embed"
          cite={videoUrl}
          data-video-id={videoId}
          style={{ maxWidth: 605, minWidth: 325, margin: 0 }}
        >
          <section />
        </blockquote>
      </div>

      {/* Same close-button treatment as TwitchEmbed's onClose. */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close player"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
        >
          ✕
        </button>
      )}
    </div>
  );
}
