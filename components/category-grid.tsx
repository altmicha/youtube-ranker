"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { VIDEO_CATEGORIES, type VideoCategory } from "@/lib/types/database.types";
import { categoryGradient, categorySlug } from "@/lib/categories";
import { cn } from "@/lib/utils";

export function CategoryGrid() {
  const [query, setQuery] = useState("");

  const tiles: readonly ("All" | VideoCategory)[] = ["All", ...VIDEO_CATEGORIES];
  const filtered = tiles.filter((c) =>
    c.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Categories
        </h2>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories"
          className="h-8 max-w-[200px] text-sm"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {filtered.map((category) => {
          // "All" opens the full, unfiltered video list; every other
          // tile opens its own /category/<slug> page.
          const href =
            category === "All" ? "/videos" : `/category/${categorySlug(category)}`;

          return (
            <Link
              key={category}
              href={href}
              className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-lg border shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className={cn("absolute inset-0", categoryGradient(category))} />
              <div className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/0" />
              <span className="relative z-10 px-2 pb-2 text-xs font-semibold leading-tight text-white drop-shadow">
                {category}
              </span>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
            No categories match &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}
