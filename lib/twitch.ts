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

export interface TwitchLiveStatus {
  isLive: boolean;
  viewerCount: number | null;
}

/**
 * Checks live status + concurrent viewer count for up to 100 Twitch
 * logins in a single Helix Get Streams call (offline channels simply
 * don't appear in the response — there's no per-channel "offline"
 * result to parse, so anything requested but not returned is offline).
 * Returns a map keyed by lowercased login, since Twitch logins are
 * case-insensitive but display casing can vary at input time.
 *
 * Server-only, same credentials/token-cache contract as
 * fetchTwitchClipMetadata() above. Returns an empty map on any
 * failure (missing credentials, network error, API error) rather than
 * throwing — a failed live check should never break the page that
 * called it.
 */
export async function fetchTwitchLiveStatuses(
  logins: string[]
): Promise<Map<string, TwitchLiveStatus>> {
  const result = new Map<string, TwitchLiveStatus>();
  if (logins.length === 0) return result;

  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) return result;

  const token = await getTwitchAppAccessToken();
  if (!token) return result;

  // Helix caps user_login at 100 per request.
  const capped = logins.slice(0, 100);

  const url = new URL("https://api.twitch.tv/helix/streams");
  capped.forEach((login) => url.searchParams.append("user_login", login));

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${token}`,
      },
      // Requirement: never cache this — Next.js's server-side fetch()
      // caches GET requests by default unless told not to, which was
      // the actual bug: the first Get Streams call could get cached
      // indefinitely, so every later "fresh" check silently kept
      // returning that same stale (once-live) response instead of
      // hitting Twitch again, regardless of the 60s cooldown logic in
      // lib/twitch-live.ts working correctly on its own.
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.error(`Twitch Helix streams error: ${res.status} ${res.statusText}`);
      return result;
    }

    const data = await res.json();
    const liveLogins = new Set<string>();

    for (const stream of data?.data ?? []) {
      const login = typeof stream.user_login === "string" ? stream.user_login.toLowerCase() : null;
      if (!login) continue;
      liveLogins.add(login);
      result.set(login, {
        isLive: true,
        viewerCount: typeof stream.viewer_count === "number" ? stream.viewer_count : null,
      });
    }

    for (const login of capped) {
      const key = login.toLowerCase();
      if (!liveLogins.has(key)) {
        result.set(key, { isLive: false, viewerCount: null });
      }
    }

    return result;
  } catch (err) {
    console.error("Twitch streams fetch failed:", err);
    return result;
  }
}

export interface TwitchClipSummary {
  // Matches the same slug format extractTwitchClipSlug() produces and
  // fetchTwitchClipMetadata() looks up by — this is what gets stored
  // as videos.twitch_clip_slug.
  slug: string;
  title: string | null;
  thumbnailUrl: string | null;
  broadcasterName: string | null;
  viewCount: number;
  createdAt: string | null;
}

/**
 * Resolves a Twitch login (username) to that channel's broadcaster id
 * — Helix's clips/streams-by-broadcaster endpoints need the id, not
 * the login. Returns null on any failure or if the login doesn't
 * exist.
 */
export async function fetchTwitchBroadcasterId(login: string): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) return null;

  const token = await getTwitchAppAccessToken();
  if (!token) return null;

  const url = new URL("https://api.twitch.tv/helix/users");
  url.searchParams.set("login", login);

  try {
    const res = await fetch(url.toString(), {
      headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.error(`Twitch Helix users error: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    const id = data?.data?.[0]?.id;
    return typeof id === "string" ? id : null;
  } catch (err) {
    console.error("Twitch broadcaster id fetch failed:", err);
    return null;
  }
}

/**
 * Fetches this broadcaster's clips created in the last 24 hours,
 * returning the top `limit` by view count. Helix's Get Clips already
 * sorts by view count descending by default; this also re-sorts
 * defensively in case that ever changes, and caps to `limit` (10, per
 * this feature's requirement) client-side.
 */
export async function fetchTopTwitchClipsLast24h(
  broadcasterId: string,
  limit = 10
): Promise<TwitchClipSummary[]> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) return [];

  const token = await getTwitchAppAccessToken();
  if (!token) return [];

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const url = new URL("https://api.twitch.tv/helix/clips");
  url.searchParams.set("broadcaster_id", broadcasterId);
  url.searchParams.set("started_at", yesterday.toISOString());
  url.searchParams.set("ended_at", now.toISOString());
  url.searchParams.set("first", "100");

  try {
    const res = await fetch(url.toString(), {
      headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.error(`Twitch Helix clips error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    const clips = Array.isArray(data?.data) ? data.data : [];

    return clips
      .map((clip: Record<string, unknown>) => ({
        slug: typeof clip.id === "string" ? clip.id : null,
        title: typeof clip.title === "string" ? clip.title : null,
        thumbnailUrl: typeof clip.thumbnail_url === "string" ? clip.thumbnail_url : null,
        broadcasterName: typeof clip.broadcaster_name === "string" ? clip.broadcaster_name : null,
        viewCount: typeof clip.view_count === "number" ? clip.view_count : 0,
        createdAt: typeof clip.created_at === "string" ? clip.created_at : null,
      }))
      .filter((clip: { slug: string | null }): clip is TwitchClipSummary => !!clip.slug)
      .sort((a: TwitchClipSummary, b: TwitchClipSummary) => b.viewCount - a.viewCount)
      .slice(0, limit);
  } catch (err) {
    console.error("Twitch clips fetch failed:", err);
    return [];
  }
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
      cache: "no-store",
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
      cache: "no-store",
      next: { revalidate: 0 },
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
