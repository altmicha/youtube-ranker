"use client";

import { useState } from "react";
import { StreamerManager } from "@/components/creator/streamer-manager";
import { CategoryManager } from "@/components/creator/category-manager";
import type { Category, Streamer } from "@/lib/types/database.types";

// Both managers are independent Client Components; without this
// wrapper, adding a streamer in StreamerManager wouldn't show up in
// CategoryManager's streamer picker until a full page reload, since
// they'd each only know about the props passed at initial server
// render. This holds the live streamer list as shared state so the
// obvious first use of this feature — add a streamer, then add a
// category for it — works in one sitting.
export function StreamerAndCategorySection({
  initialYoutubeStreamers,
  initialTwitchStreamers,
  initialYoutubeCategories,
  initialTwitchCategories,
}: {
  initialYoutubeStreamers: Streamer[];
  initialTwitchStreamers: Streamer[];
  initialYoutubeCategories: Category[];
  initialTwitchCategories: Category[];
}) {
  const [youtubeStreamers, setYoutubeStreamers] = useState(initialYoutubeStreamers);
  const [twitchStreamers, setTwitchStreamers] = useState(initialTwitchStreamers);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-3 text-lg font-semibold">Streamers</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <StreamerManager
            platform="youtube"
            initialStreamers={initialYoutubeStreamers}
            onStreamersChange={setYoutubeStreamers}
          />
          <StreamerManager
            platform="twitch"
            initialStreamers={initialTwitchStreamers}
            onStreamersChange={setTwitchStreamers}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Categories</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <CategoryManager
            platform="youtube"
            initialCategories={initialYoutubeCategories}
            streamers={youtubeStreamers}
          />
          <CategoryManager
            platform="twitch"
            initialCategories={initialTwitchCategories}
            streamers={twitchStreamers}
          />
        </div>
      </div>
    </div>
  );
}
