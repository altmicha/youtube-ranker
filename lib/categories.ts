import {
  SELECTABLE_CATEGORIES,
  type VideoCategory,
  type SelectableVideoCategory,
} from "@/lib/types/database.types";

// URL-safe slug for a category, used for /category/<slug> routes.
// "Cop Slop" -> "cop-slop", "Just Chatting" -> "just-chatting", etc.
export function categorySlug(category: VideoCategory): string {
  return category.toLowerCase().replace(/\s+/g, "-");
}

// Reverse lookup: turns a route param back into a real, currently
// browsable category, or null if it doesn't match one. Deliberately
// checks against SELECTABLE_CATEGORIES (not the full VIDEO_CATEGORIES
// enum list) — so a slug for a removed category like /category/irl
// or /category/variety no longer resolves, and the route 404s, even
// though "IRL" and "Variety" are still valid values a video row can
// hold in the database.
export function categoryFromSlug(slug: string): SelectableVideoCategory | null {
  return SELECTABLE_CATEGORIES.find((c) => categorySlug(c) === slug) ?? null;
}
