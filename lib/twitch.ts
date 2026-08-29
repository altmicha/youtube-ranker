/**
 * Extracts a Twitch clip slug from either URL shape:
 *   https://clips.twitch.tv/ClipSlug
 *   https://www.twitch.tv/CHANNEL/clip/ClipSlug
 * Returns null if the URL isn't a recognizable Twitch clip link.
 */
export function extractTwitchClipSlug(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  if (host === "clips.twitch.tv") {
    const slug = url.pathname.replace(/^\/+/, "").split("/")[0];
    return slug || null;
  }

  if (host === "twitch.tv") {
    // /CHANNEL/clip/SLUG
    const parts = url.pathname.replace(/^\/+/, "").split("/");
    const clipIndex = parts.indexOf("clip");
    if (clipIndex !== -1 && parts[clipIndex + 1]) {
      return parts[clipIndex + 1];
    }
    return null;
  }

  return null;
}

export interface TwitchClipMetadata {
  title: string | null;
  thumbnailUrl: string | null;
  broadcasterName: string | null;
  viewCount: number | null;
  createdAt: string | null;
}

// In-memory app access token cache. Twitch app tokens (client
// credentials grant) are typically valid for ~60 days, so caching
// this across requests within the same server instance avoids an
// extra OAuth round trip on every single clip submission. This is
// per-server-instance (not shared across serverless cold starts),
// which is fine — worst case is one extra token fetch after a cold
// start, not a correctness issue.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getTwitchAppAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET not set; skipping Twitch fetch.");
    return null;
  }

  try {
    const res = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    });

    if (!res.ok) {
      console.error(`Twitch OAuth error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    if (typeof data.access_token !== "string") return null;

    // Refresh a little early (5 min buffer) rather than right at expiry.
    const expiresInMs = (typeof data.expires_in === "number" ? data.expires_in : 0) * 1000;
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + Math.max(expiresInMs - 5 * 60 * 1000, 0),
    };
    return cachedToken.value;
  } catch (err) {
    console.error("Twitch OAuth token fetch failed:", err);
    return null;
  }
}

/**
 * Fetches title, thumbnail, broadcaster name, view count, and
 * creation date for a Twitch clip via Helix Get Clips. Server-only —
 * TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET are read from process.env,
 * never exposed to the browser (this file is never imported from a
 * "use client" component, and neither env var has a NEXT_PUBLIC_
 * prefix).
 *
 * Returns null on any failure (missing credentials, network error,
 * clip not found, API error) so a metadata failure never blocks the
 * submission itself — same contract as fetchYoutubeMetadata().
 */
export async function fetchTwitchClipMetadata(
  slug: string
): Promise<TwitchClipMetadata | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) return null;

  const token = await getTwitchAppAccessToken();
  if (!token) return null;

  const url = new URL("https://api.twitch.tv/helix/clips");
  url.searchParams.set("id", slug);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      console.error(`Twitch Helix error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const clip = data?.data?.[0];
    if (!clip) {
      // Valid response, but no matching clip (deleted/bad slug).
      return null;
    }

    return {
      title: typeof clip.title === "string" ? clip.title : null,
      thumbnailUrl: typeof clip.thumbnail_url === "string" ? clip.thumbnail_url : null,
      broadcasterName: typeof clip.broadcaster_name === "string" ? clip.broadcaster_name : null,
      viewCount: typeof clip.view_count === "number" ? clip.view_count : null,
      createdAt: typeof clip.created_at === "string" ? clip.created_at : null,
    };
  } catch (err) {
    console.error("Twitch clip metadata fetch failed:", err);
    return null;
  }
}
