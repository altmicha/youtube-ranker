import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Video } from "@/lib/types/database.types";

export function VideoCard({
  video,
  action,
}: {
  video: Video;
  action: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-sm">
      <div className="flex items-center gap-2.5 p-2">
        <a
          href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
          target="_blank"
          rel="noreferrer"
          className="flex-shrink-0"
        >
          {video.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.thumbnail_url}
              alt=""
              className="h-10 w-[72px] rounded object-cover sm:h-12 sm:w-[85px]"
            />
          ) : (
            <div className="flex h-10 w-[72px] items-center justify-center rounded bg-muted text-[9px] text-muted-foreground sm:h-12 sm:w-[85px]">
              No thumb
            </div>
          )}
        </a>

        <div className="min-w-0 flex-1">
          <a
            href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
            target="_blank"
            rel="noreferrer"
            className="line-clamp-1 text-xs font-medium leading-snug hover:underline sm:text-sm"
          >
            {video.title ?? `youtube.com/watch?v=${video.youtube_id}`}
          </a>
          {video.channel_name && (
            <p className="truncate text-[11px] text-muted-foreground">
              {video.channel_name}
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

        <div className="flex-shrink-0">{action}</div>
      </div>
    </Card>
  );
}
