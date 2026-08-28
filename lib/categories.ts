import { VIDEO_CATEGORIES, type VideoCategory } from "@/lib/types/database.types";

// Deterministic gradient per category, so each poster tile has a
// distinct "cover" look (like Twitch's category art) without needing
// actual images per category.
const GRADIENTS = [
  "bg-gradient-to-br from-violet-500 to-purple-700",
  "bg-gradient-to-br from-rose-500 to-pink-700",
  "bg-gradient-to-br from-amber-500 to-orange-700",
  "bg-gradient-to-br from-emerald-500 to-teal-700",
  "bg-gradient-to-br from-sky-500 to-blue-700",
  "bg-gradient-to-br from-fuchsia-500 to-purple-800",
  "bg-gradient-to-br from-lime-500 to-green-700",
  "bg-gradient-to-br from-red-500 to-rose-800",
  "bg-gradient-to-br from-slate-600 to-slate-900",
  "bg-gradient-to-br from-indigo-500 to-blue-800",
  "bg-gradient-to-br from-cyan-500 to-sky-700",
  "bg-gradient-to-br from-orange-500 to-red-700",
];

const ALL_GRADIENT = "bg-gradient-to-br from-zinc-500 to-zinc-800";

export function categoryGradient(category: VideoCategory | "All"): string {
  if (category === "All") return ALL_GRADIENT;
  const index = VIDEO_CATEGORIES.indexOf(category);
  return GRADIENTS[index % GRADIENTS.length];
}

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
