import type { VideoCategory } from "@/lib/types/database.types";

// URL-safe slug for a category, used for /youtube/<slug> and
// /twitch/<slug> routes. "Cop Slop" -> "cop-slop", "Just Chatting" ->
// "just-chatting", etc.
export function categorySlug(category: VideoCategory): string {
  return category.toLowerCase().replace(/\s+/g, "-");
}

// Reverse lookup: turns a route param back into a real category from
// the given platform-specific allowed list, or null if it doesn't
// match one. Generic over the allowed list rather than hardcoding
// one, since /youtube/[slug] and /twitch/[slug] each have their own
// (different-sized) set of browsable categories — a slug that's
// valid on one platform but not the other correctly 404s on the
// wrong one (e.g. /twitch/gaming, since "Gaming" isn't in
// TWITCH_SELECTABLE_CATEGORIES).
export function categoryFromSlug<T extends VideoCategory>(
  slug: string,
  allowed: readonly T[]
): T | null {
  return allowed.find((c) => categorySlug(c) === slug) ?? null;
}
