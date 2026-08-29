"use client";

import { useState } from "react";
import Link from "next/link";

const PLATFORMS = [
  {
    slug: "youtube",
    label: "YouTube",
    href: "/youtube",
    gradient: "bg-gradient-to-br from-red-500 to-red-800",
  },
  {
    slug: "twitch",
    label: "Twitch",
    href: "/twitch",
    gradient: "bg-gradient-to-br from-[#9146FF] to-purple-900",
  },
] as const;

function PlatformPoster({
  slug,
  gradient,
}: {
  slug: string;
  gradient: string;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className={`relative h-48 w-36 overflow-hidden rounded-md ${gradient}`}>
      {!imgError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/platforms/${slug}.jpg`}
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

// Same card style as the category tiles (see components/category-grid.tsx)
// — just two of them, no search box needed for a set this small.
export function PlatformGrid() {
  return (
    <div className="flex flex-wrap gap-3">
      {PLATFORMS.map((platform) => (
        <Link
          key={platform.slug}
          href={platform.href}
          // /youtube and /twitch are dynamic routes (they query the
          // DB), so Next's default prefetch-on-visible behavior was
          // eagerly fetching their full payload from the homepage
          // before the user ever clicked — that's the "fetches
          // /youtube twice, /twitch twice" from the network tab.
          // prefetch={false} means they're only ever fetched once,
          // on an actual click/navigation.
          prefetch={false}
          className="block w-36 no-underline"
        >
          <PlatformPoster slug={platform.slug} gradient={platform.gradient} />
          <div className="mt-1 truncate text-sm">{platform.label}</div>
        </Link>
      ))}
    </div>
  );
}
