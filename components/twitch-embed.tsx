// Domains this site is embedded from — Twitch requires every parent
// domain to be listed explicitly via repeated &parent= params. Add
// another &parent=your-domain here if this deploys somewhere else.
const EMBED_PARENTS = ["localhost", "youtube-ranker.vercel.app"];

export function TwitchEmbed({ slug }: { slug: string }) {
  const parentParams = EMBED_PARENTS.map((p) => `parent=${p}`).join("&");

  return (
    <div className="border-t p-2">
      {/* Same taller-on-mobile treatment as the YouTube embed, for
          consistency — see components/video-embed.tsx. */}
      <div className="aspect-[4/3] w-full overflow-hidden rounded-md bg-black sm:aspect-video">
        <iframe
          className="h-full w-full"
          src={`https://clips.twitch.tv/embed?clip=${slug}&autoplay=false&${parentParams}`}
          title="Twitch clip player"
          allowFullScreen
        />
      </div>

      <a
        href={`https://clips.twitch.tv/${slug}`}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 block text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        Open on Twitch ↗
      </a>
    </div>
  );
}
