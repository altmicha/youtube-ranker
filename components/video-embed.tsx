export function VideoEmbed({ youtubeId }: { youtubeId: string }) {
  return (
    <div className="border-t p-2">
      <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
        <iframe
          className="h-full w-full"
          // Requirement 3: official embed URL. autoplay=1 since the
          // user just explicitly clicked to open this player, but
          // mute=1 alongside it — "do not autoplay with sound". The
          // viewer can unmute using the player's own controls.
          src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <a
        href={`https://www.youtube.com/watch?v=${youtubeId}`}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-block text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        Open on YouTube ↗
      </a>
    </div>
  );
}
