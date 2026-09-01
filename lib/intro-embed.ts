import { extractYoutubeId } from "@/lib/youtube";
import { extractTwitchClipSlug } from "@/lib/twitch";

export type IntroEmbedInfo =
  | { type: "youtube"; id: string }
  | { type: "twitch_clip"; slug: string }
  | { type: "twitch_video"; videoId: string };

/**
 * Extracts a Twitch VOD (video) id from https://www.twitch.tv/videos/1234567890.
 * Distinct from extractTwitchClipSlug() — a clip and a full VOD are
 * different Twitch objects with different embed URLs.
 */
function extractTwitchVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "twitch.tv") return null;

  const parts = url.pathname.replace(/^\/+/, "").split("/");
  if (parts[0] === "videos" && /^\d+$/.test(parts[1] ?? "")) {
    return parts[1];
  }

  return null;
}

/**
 * Requirement: accept youtube.com/youtu.be, and twitch.tv clips or
 * videos. Reuses the same extractYoutubeId()/extractTwitchClipSlug()
 * this app already uses for regular video submissions, plus the new
 * VOD extractor above. Returns null for anything else — this is the
 * single source of truth for "is this URL acceptable", used both for
 * quick client-side feedback and (what actually matters) the
 * server-side check in app/actions/streamer-intro.ts.
 */
export function parseIntroUrl(rawUrl: string): IntroEmbedInfo | null {
  const youtubeId = extractYoutubeId(rawUrl);
  if (youtubeId) return { type: "youtube", id: youtubeId };

  const clipSlug = extractTwitchClipSlug(rawUrl);
  if (clipSlug) return { type: "twitch_clip", slug: clipSlug };

  const videoId = extractTwitchVideoId(rawUrl);
  if (videoId) return { type: "twitch_video", videoId };

  return null;
}
