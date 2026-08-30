import Link from "next/link";
import type { Category } from "@/lib/types/database.types";
import { categoryImageUrl } from "@/lib/category-image";

// Deliberately separate from components/category-grid.tsx rather than
// reusing/modifying it: CategoryGrid takes one basePath for the whole
// list (it's only ever used on /youtube or /twitch, where every card
// is the same platform). A streamer's categories can span both
// platforms, so each card here computes its own /youtube/<slug> or
// /twitch/<slug> href from that category's own `platform`. This keeps
// /youtube and /twitch completely untouched.
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
        const basePath = category.platform === "youtube" ? "/youtube" : "/twitch";

        return (
          <Link
            key={category.id}
            href={`${basePath}/${category.slug}`}
            className="block w-36 no-underline"
          >
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
              {category.platform === "youtube" ? "YouTube" : "Twitch"}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
