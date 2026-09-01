import { buttonVariants } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StreamerHeroProps {
  displayName: string;
  avatarUrl: string | null;
  isLive: boolean;
  viewerCount: number | null;
  twitchUrl: string | null;
  youtubeUrl: string | null;
}

// Avatar/name/LIVE badge/watch buttons. Bio moved out to its own
// components/streamer-bio.tsx (rendered separately, right under this
// component, from app/streamer/[slug]/page.tsx) — it now needs
// interactivity (inline editing for the owner/creator/admin) and
// markdown-link rendering that don't belong bundled into this
// otherwise-static component. Featured clips was extracted the same
// way last turn, for the same reason (streamers.layout treats each as
// an independent section).
export function StreamerHero({
  displayName,
  avatarUrl,
  isLive,
  viewerCount,
  twitchUrl,
  youtubeUrl,
}: StreamerHeroProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
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
  );
}
