/**
 * Extracts a TikTok video id from a canonical video URL, e.g.
 *   https://www.tiktok.com/@username/video/7123456789012345678
 * Returns null for anything else.
 *
 * Known limitation: TikTok's native share button gives out short
 * links (vm.tiktok.com/XXXXXXX, vt.tiktok.com/XXXXXXX) that only
 * resolve to the canonical /video/ URL via an actual HTTP redirect —
 * this is a pure, synchronous parser, so it can't follow that
 * redirect, and those short links are rejected here the same as any
 * other unrecognized URL. A submitter needs to open the share sheet's
 * "Copy link" option that gives the full www.tiktok.com URL, or copy
 * the URL straight from their browser's address bar.
 */
export function extractTiktokVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "tiktok.com") return null;

  const match = url.pathname.match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}

export interface TiktokMetadata {
  title: string | null;
  thumbnailUrl: string | null;
  authorName: string | null;
}

/**
 * Fetches title/thumbnail/author from TikTok's oEmbed endpoint — no
 * API key needed, same "fail open" contract as fetchYoutubeMetadata()/
 * fetchTwitchClipMetadata(): never throws, returns null on any
 * failure, so a metadata fetch problem never blocks the submission
 * itself. Note TikTok's oEmbed response has no public view count at
 * all (unlike YouTube's Data API or Twitch's Helix), so there's
 * nothing to return for that here — videos.view_count stays null for
 * every tiktok row.
 */
export async function fetchTiktokMetadata(videoUrl: string): Promise<TiktokMetadata | null> {
  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;

  try {
    const res = await fetch(oembedUrl, { cache: "no-store" });
    if (!res.ok) {
      console.error(`TikTok oEmbed error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    return {
      title: typeof data.title === "string" ? data.title : null,
      thumbnailUrl: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
      authorName: typeof data.author_name === "string" ? data.author_name : null,
    };
  } catch (err) {
    console.error("TikTok oEmbed fetch failed:", err);
    return null;
  }
}
