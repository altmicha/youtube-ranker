import Link from "next/link";
import type { Category } from "@/lib/types/database.types";
import { categoryImageUrl } from "@/lib/category-image";

// Deliberately separate from components/category-grid.tsx rather than
// reusing/modifying it: CategoryGrid takes one basePath for the whole
// list (it's only ever used on /youtube, /twitch, or /tiktok, where
// every card is the same platform). A streamer's categories can span
// all three platforms, so each card here computes its own
// /youtube/<slug>, /twitch/<slug>, or /tiktok/<slug> href from that
// category's own `platform`. This keeps /youtube, /twitch, and
// /tiktok completely untouched — this file is the only thing that
// changed to fix TikTok cards routing to the wrong platform.
const GRADIENT_PALETTE = [
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

function gradientForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return GRADIENT_PALETTE[Math.abs(hash) % GRADIENT_PALETTE.length];
}

export function StreamerCategoryList({ categories }: { categories: Category[] }) {
  if (categories.length === 0) {
    return (
      <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        No categories yet.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {categories.map((category) => {
        const imageUrl = categoryImageUrl(category.image_path);
        // Requirement fix: this was a binary youtube/twitch ternary
        // with no third branch, so every TikTok category fell through
        // to the "else" case and linked to /twitch/<slug> — same bug
        // in the label below. Now a real 3-way branch on
        // category.platform.
        const basePath =
          category.platform === "youtube" ? "/youtube" : category.platform === "twitch" ? "/twitch" : "/tiktok";
        const platformLabel =
          category.platform === "youtube" ? "YouTube" : category.platform === "twitch" ? "Twitch" : "TikTok";
        // Requirement: official "funny clips" and queue "funny clips"
        // can now share a slug for the same streamer+platform — the
        // ?kind= param is what keeps their links from colliding on
        // the exact same /<platform>/<slug> destination. Omitted for
        // "official" so those URLs stay exactly as they always looked
        // — same convention applied to TikTok, not a special case.
        const href =
          category.kind === "queue"
            ? `${basePath}/${category.slug}?kind=queue`
            : `${basePath}/${category.slug}`;

        return (
          <Link key={category.id} href={href} className="block w-36 no-underline">
            <div
              className={`relative h-48 w-36 overflow-hidden rounded-md ${gradientForId(category.id)}`}
            >
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </div>
            <div className="mt-1 truncate text-sm">{category.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {platformLabel}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
