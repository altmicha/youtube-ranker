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
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex items-center gap-4 p-3 sm:p-4">
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
              className="h-16 w-28 rounded-lg object-cover sm:h-20 sm:w-36"
            />
          ) : (
            <div className="flex h-16 w-28 items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground sm:h-20 sm:w-36">
              No thumbnail
            </div>
          )}
        </a>

        <div className="min-w-0 flex-1">
          <a
            href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
            target="_blank"
            rel="noreferrer"
            className="line-clamp-2 text-sm font-medium leading-snug hover:underline sm:text-base"
          >
            {video.title ?? `youtube.com/watch?v=${video.youtube_id}`}
          </a>
          {video.channel_name && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
              {video.channel_name}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="muted" className="font-mono">
              {video.submission_count}{" "}
              {video.submission_count === 1 ? "submission" : "submissions"}
            </Badge>
            <Badge variant="muted" className="font-mono">
              {video.vote_count} {video.vote_count === 1 ? "vote" : "votes"}
            </Badge>
          </div>
        </div>

        <div className="flex-shrink-0">{action}</div>
      </div>
    </Card>
  );
}
