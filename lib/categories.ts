import { VIDEO_CATEGORIES, type VideoCategory } from "@/lib/types/database.types";

// URL-safe slug for a category, used for /category/<slug> routes.
// "Cop Slop" -> "cop-slop", "Just Chatting" -> "just-chatting", etc.
export function categorySlug(category: VideoCategory): string {
  return category.toLowerCase().replace(/\s+/g, "-");
}

// Reverse lookup: turns a route param back into a real category, or
// null if it doesn't match any known category (route handler should
// 404 in that case rather than guessing).
export function categoryFromSlug(slug: string): VideoCategory | null {
  return VIDEO_CATEGORIES.find((c) => categorySlug(c) === slug) ?? null;
}
