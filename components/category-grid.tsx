"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { VIDEO_CATEGORIES, type VideoCategory } from "@/lib/types/database.types";
import { categorySlug } from "@/lib/categories";

const GRADIENTS: Record<VideoCategory, string> = {
  Gaming: "bg-gradient-to-br from-violet-500 to-purple-700",
  Funny: "bg-gradient-to-br from-rose-500 to-pink-700",
  LSF: "bg-gradient-to-br from-amber-500 to-orange-700",
  "Cop Slop": "bg-gradient-to-br from-emerald-500 to-teal-700",
  React: "bg-gradient-to-br from-sky-500 to-blue-700",
  IRL: "bg-gradient-to-br from-fuchsia-500 to-purple-800",
  Slots: "bg-gradient-to-br from-lime-500 to-green-700",
  Sports: "bg-gradient-to-br from-red-500 to-rose-800",
  Horror: "bg-gradient-to-br from-slate-600 to-slate-900",
  Variety: "bg-gradient-to-br from-indigo-500 to-blue-800",
  Music: "bg-gradient-to-br from-cyan-500 to-sky-700",
  "Just Chatting": "bg-gradient-to-br from-orange-500 to-red-700",
};
const ALL_GRADIENT = "bg-gradient-to-br from-zinc-500 to-zinc-800";

interface CategoryTile {
  slug: string;
  name: string;
  gradient: string;
  count?: number;
}

export function CategoryGrid({
  counts,
}: {
  counts?: Partial<Record<VideoCategory, number>>;
}) {
  const [query, setQuery] = useState("");

  const totalCount = counts
    ? Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)
    : undefined;

  const categories: CategoryTile[] = [
    { slug: "all", name: "All", gradient: ALL_GRADIENT, count: totalCount },
    ...VIDEO_CATEGORIES.map((name) => ({
      slug: categorySlug(name),
      name,
      gradient: GRADIENTS[name],
      count: counts?.[name],
    })),
  ].filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

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
        {categories.map((category) => {
          const href = category.slug === "all" ? "/videos" : `/category/${category.slug}`;
          return (
            <Link
              key={category.slug}
              href={href}
              className="block w-36 no-underline"
            >
              <div
                className={`flex h-48 w-36 items-end rounded-md p-2 ${category.gradient}`}
              >
                <span className="text-sm font-semibold text-white">
                  {category.name}
                </span>
              </div>
              <div className="mt-1 truncate text-sm text-white">{category.name}</div>
              {!!category.count && (
                <div className="text-xs text-zinc-400">
                  {category.count} {category.count === 1 ? "video" : "videos"}
                </div>
              )}
            </Link>
          );
        })}
        {categories.length === 0 && (
          <p className="w-full py-6 text-center text-sm text-muted-foreground">
            No categories match &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}
