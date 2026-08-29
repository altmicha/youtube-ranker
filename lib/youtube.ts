/**
 * Extracts the 11-character YouTube video ID from any common URL shape:
 *   https://www.youtube.com/watch?v=VIDEOID
 *   https://youtu.be/VIDEOID
 *   https://www.youtube.com/shorts/VIDEOID
 *   https://www.youtube.com/embed/VIDEOID
 *   https://m.youtube.com/watch?v=VIDEOID
 * Returns null if the URL isn't a recognizable YouTube video link.
 */
export function extractYoutubeId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\.|^m\./, "");
  const isYoutubeHost = host === "youtube.com" || host === "youtu.be";
  if (!isYoutubeHost) return null;

  let id: string | null = null;

  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else if (url.pathname.startsWith("/shorts/")) {
    id = url.pathname.split("/")[2];
  } else if (url.pathname.startsWith("/embed/")) {
    id = url.pathname.split("/")[2];
  }

  if (!id) return null;

  // Standard YouTube video IDs are 11 chars of [A-Za-z0-9_-]
  const valid = /^[A-Za-z0-9_-]{11}$/.test(id);
  return valid ? id : null;
}

export interface YoutubeMetadata {
  title: string | null;
  thumbnailUrl: string | null;
  channelName: string | null;
  viewCount: number | null;
  likeCount: number | null;
  // YouTube publicly hid dislike counts from the Data API in Dec
  // 2021 — almost every video will have this come back as null.
  // Requirement 4: only ever set from a real API value, never faked.
  dislikeCount: number | null;
  publishedAt: string | null;
}

/**
 * Fetches title, thumbnail, channel name, and view/like/dislike
 * counts from the YouTube Data API v3 — one request, both `snippet`
 * and `statistics` parts. Server-only — reads YOUTUBE_API_KEY from
 * process.env, which is never exposed to the browser since this file
 * is only ever imported from Server Actions/Components (nothing here
 * is marked "use client", and there's no NEXT_PUBLIC_ prefix on the
 * env var).
 *
 * Returns null (not a throw) on any failure — missing key, network
 * error, video not found, API error response — so callers can treat
 * "no metadata" as a normal case and still save the submission with
 * just the video ID, per the requirement that a metadata/stats
 * failure should never block a submission.
 */
export async function fetchYoutubeMetadata(
  videoId: string
): Promise<YoutubeMetadata | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error("YOUTUBE_API_KEY is not set; skipping metadata fetch.");
    return null;
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`YouTube API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const item = data?.items?.[0];
    const snippet = item?.snippet;
    if (!snippet) {
      // Valid response, but no matching video (private/deleted/bad ID).
      return null;
    }

    const thumbnail =
      snippet.thumbnails?.high?.url ??
      snippet.thumbnails?.medium?.url ??
      snippet.thumbnails?.default?.url ??
      null;

    // statistics counts come back as strings (or can be missing
    // entirely, e.g. a channel disabled its view count, or dislikes
    // post-2021). parseCount() turns a present numeric string into a
    // number and anything else into null — never a fabricated 0.
    const stats = item?.statistics ?? {};
    const parseCount = (value: unknown): number | null => {
      if (typeof value !== "string") return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    return {
      title: snippet.title ?? null,
      thumbnailUrl: thumbnail,
      channelName: snippet.channelTitle ?? null,
      viewCount: parseCount(stats.viewCount),
      likeCount: parseCount(stats.likeCount),
      dislikeCount: parseCount(stats.dislikeCount),
      // snippet.publishedAt is an ISO 8601 string already
      // (e.g. "2015-03-14T10:00:00Z") — stored as-is.
      publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : null,
    };
  } catch (err) {
    console.error("YouTube metadata fetch failed:", err);
    return null;
  }
}
