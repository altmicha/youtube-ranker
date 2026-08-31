"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import type { Category } from "@/lib/types/database.types";
import { categoryImageUrl } from "@/lib/category-image";

// Fixed fallback gradient palette. Categories are creator-managed
// free text now (not a fixed enum), so gradients are assigned by
// hashing each category's id to a stable index — same category
// always gets the same color regardless of list order.
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

// Poster for one card: shows the creator-uploaded image if there is
// one, falling back to a color gradient if there isn't (or if the
// image fails to load).
function CategoryPoster({
  imageUrl,
  gradient,
}: {
  imageUrl: string | null;
  gradient: string;
}) {
  const [imgError, setImgError] = useState(false);
  const showImage = !!imageUrl && !imgError;

  return (
    <div className={`relative h-48 w-36 overflow-hidden rounded-md ${gradient}`}>
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImgError(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}

export function CategoryGrid({
  categories,
  basePath,
}: {
  categories: Category[];
  // "/youtube" or "/twitch" — each tile links to `${basePath}/${slug}`.
  basePath: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Categories
        </h2>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories"
          className="h-7 max-w-[160px] text-xs"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        {filtered.map((category) => {
          // Requirement: official and queue can now share a slug on
          // the same platform (see add_category_kind.sql) — the
          // destination page needs ?kind= to know which one to show.
          // Omitted for "official" (the default) so those URLs look
          // exactly like they always have.
          const href =
            category.kind === "queue"
              ? `${basePath}/${category.slug}?kind=queue`
              : `${basePath}/${category.slug}`;

          return (
            <Link key={category.id} href={href} className="block w-36 no-underline">
              <CategoryPoster
                imageUrl={categoryImageUrl(category.image_path)}
                gradient={gradientForId(category.id)}
              />
              <div className="mt-1 truncate text-sm">{category.name}</div>
            </Link>
          );
        })}
        {filtered.length === 0 && categories.length > 0 && (
          <p className="w-full py-6 text-center text-sm text-muted-foreground">
            No categories match &ldquo;{query}&rdquo;.
          </p>
        )}
        {categories.length === 0 && (
          <p className="w-full py-6 text-center text-sm text-muted-foreground">
            No categories yet.
          </p>
        )}
      </div>
    </div>
  );
}
