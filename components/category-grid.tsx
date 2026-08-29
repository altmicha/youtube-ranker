"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import type { VideoCategory } from "@/lib/types/database.types";
import { categorySlug } from "@/lib/categories";

// Gradient class strings live here (a scanned path — see
// tailwind.config.ts content globs) so Tailwind actually generates
// the CSS for them. Covers every category either platform currently
// offers — YouTube's 8 and Twitch's 2 (LSF, Funny), which are a
// subset of the same 8, so one shared map covers both.
const GRADIENTS: Partial<Record<VideoCategory, string>> = {
  Gaming: "bg-gradient-to-br from-violet-500 to-purple-700",
  Funny: "bg-gradient-to-br from-rose-500 to-pink-700",
  LSF: "bg-gradient-to-br from-amber-500 to-orange-700",
  "Cop Slop": "bg-gradient-to-br from-emerald-500 to-teal-700",
  React: "bg-gradient-to-br from-sky-500 to-blue-700",
  Sports: "bg-gradient-to-br from-red-500 to-rose-800",
  Horror: "bg-gradient-to-br from-slate-600 to-slate-900",
  Music: "bg-gradient-to-br from-cyan-500 to-sky-700",
};
const FALLBACK_GRADIENT = "bg-gradient-to-br from-zinc-500 to-zinc-800";

// Poster for one card: tries /public/categories/<slug>.jpg first
// (shared across platforms — "LSF" has one cover image regardless of
// whether it's reached via /youtube/lsf or /twitch/lsf), and silently
// falls back to the gradient if that file 404s or hasn't been added.
function CategoryPoster({ slug, gradient }: { slug: string; gradient: string }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className={`relative h-48 w-36 overflow-hidden rounded-md ${gradient}`}>
      {!imgError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/categories/${slug}.jpg`}
          alt=""
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
  categories: readonly VideoCategory[];
  // "/youtube" or "/twitch" — each tile links to `${basePath}/${slug}`.
  basePath: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = categories.filter((name) =>
    name.toLowerCase().includes(query.trim().toLowerCase())
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
        {filtered.map((name) => {
          const slug = categorySlug(name);
          return (
            <Link key={slug} href={`${basePath}/${slug}`} className="block w-36 no-underline">
              <CategoryPoster slug={slug} gradient={GRADIENTS[name] ?? FALLBACK_GRADIENT} />
              <div className="mt-1 truncate text-sm">{name}</div>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <p className="w-full py-6 text-center text-sm text-muted-foreground">
            No categories match &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}
