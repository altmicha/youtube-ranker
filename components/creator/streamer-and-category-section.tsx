"use client";

import { useState } from "react";
import { StreamerManager } from "@/components/creator/streamer-manager";
import { CategoryManager } from "@/components/creator/category-manager";
import type { Category, Streamer } from "@/lib/types/database.types";

// Both are independent Client Components; without this wrapper,
// adding a streamer in StreamerManager wouldn't show up in either
// CategoryManager's streamer picker until a full page reload, since
// they'd each only know about the props passed at initial server
// render. This holds the one unified streamer list as shared state so
// the obvious first use of this feature — add a streamer, then add a
// category (of either type) for it — works in one sitting.
//
// Requirement 1/2: a single Streamers section/list — streamers are no
// longer split by platform. Categories stay split into YouTube/Twitch
// managers (that's still where "type: YouTube or Twitch" is picked,
// per category — requirement 3), but both managers now draw from the
// exact same streamer list, so any streamer can be picked for either.
export function StreamerAndCategorySection({
  initialStreamers,
  initialYoutubeCategories,
  initialTwitchCategories,
}: {
  initialStreamers: Streamer[];
  initialYoutubeCategories: Category[];
  initialTwitchCategories: Category[];
}) {
  const [streamers, setStreamers] = useState(initialStreamers);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-3 text-lg font-semibold">Streamers</h2>
        <StreamerManager initialStreamers={initialStreamers} onStreamersChange={setStreamers} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Categories</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <CategoryManager
            platform="youtube"
            initialCategories={initialYoutubeCategories}
            streamers={streamers}
          />
          <CategoryManager
            platform="twitch"
            initialCategories={initialTwitchCategories}
            streamers={streamers}
          />
        </div>
      </div>
    </div>
  );
}
