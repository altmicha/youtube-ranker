"use client";

import { useState } from "react";
import { StreamerManager, type OwnerOption } from "@/components/creator/streamer-manager";
import { CategoryManager } from "@/components/creator/category-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Category, Streamer } from "@/lib/types/database.types";

// Requirement: search box instead of a dropdown — type a name,
// matching streamers appear below, click one to select. Once
// selected, this collapses to just the chosen name + a "Change
// streamer" button (keeping the selection visible), rather than
// going back to an empty search box — the parent's selectedStreamerId
// state (not local state here) is what CategoryManager below actually
// reacts to either way.
function StreamerSearchPicker({
  streamers,
  selectedStreamerId,
  onSelect,
  onClear,
}: {
  streamers: Streamer[];
  selectedStreamerId: string;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const selected = streamers.find((s) => s.id === selectedStreamerId);

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Streamer:</span>
        <span className="text-sm font-medium">{selected.display_name}</span>
        <Button type="button" size="sm" variant="outline" onClick={onClear}>
          Change streamer
        </Button>
      </div>
    );
  }

  const trimmedQuery = query.trim().toLowerCase();
  const matches = trimmedQuery
    ? streamers.filter((s) => s.display_name.toLowerCase().includes(trimmedQuery))
    : [];

  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={streamers.length === 0 ? "No streamers yet" : "Search streamers…"}
        disabled={streamers.length === 0}
        className="h-8 text-sm"
      />
      {trimmedQuery && (
        <div className="flex flex-col gap-0.5 rounded-md border p-1">
          {matches.length > 0 ? (
            matches.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onSelect(s.id);
                  setQuery("");
                }}
                className="rounded px-2 py-1 text-left text-sm hover:bg-muted"
              >
                {s.display_name}
              </button>
            ))
          ) : (
            <p className="px-2 py-1 text-xs text-muted-foreground">No matching streamers.</p>
          )}
        </div>
      )}
    </div>
  );
}

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
  canManageOfficial,
  owners,
}: {
  initialStreamers: Streamer[];
  initialYoutubeCategories: Category[];
  initialTwitchCategories: Category[];
  // Creator-only. Passed down from app/creator/page.tsx (which knows
  // the current viewer's role) to both CategoryManagers, so a
  // streamer viewing this page can still add Queue categories but
  // not Official ones — see canManageOfficial in CategoryManager.
  canManageOfficial: boolean;
  // Candidate Owner picker options, fetched from profiles (publicly
  // readable) by app/creator/page.tsx.
  owners: OwnerOption[];
}) {
  const [streamers, setStreamers] = useState(initialStreamers);
  // Requirement: nothing selected by default — CategoryManager below
  // reads an empty string as "show nothing" rather than every
  // category across every streamer, unchanged from before.
  const [selectedStreamerId, setSelectedStreamerId] = useState("");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-3 text-lg font-semibold">Streamers</h2>
        <StreamerManager initialStreamers={initialStreamers} owners={owners} onStreamersChange={setStreamers} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Categories</h2>
        <div className="mb-4">
          <StreamerSearchPicker
            streamers={streamers}
            selectedStreamerId={selectedStreamerId}
            onSelect={setSelectedStreamerId}
            onClear={() => setSelectedStreamerId("")}
          />
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <CategoryManager
            platform="youtube"
            initialCategories={initialYoutubeCategories}
            streamers={streamers}
            canManageOfficial={canManageOfficial}
            selectedStreamerId={selectedStreamerId}
          />
          <CategoryManager
            platform="twitch"
            initialCategories={initialTwitchCategories}
            streamers={streamers}
            canManageOfficial={canManageOfficial}
            selectedStreamerId={selectedStreamerId}
          />
        </div>
      </div>
    </div>
  );
}
