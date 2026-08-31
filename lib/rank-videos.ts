import type { createClient } from "@/lib/supabase/server";
import type { Video } from "@/lib/types/database.types";

// Same pattern already used in app/actions/videos.ts — types against
// createClient()'s own return type rather than importing
// @supabase/supabase-js's SupabaseClient directly.
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Given a base list of videos (already filtered by source+category)
 * and an optional "since" cutoff, returns only the videos with at
 * least one submission in that window, with submission_count
 * overwritten to the WINDOWED count (matching prior display
 * behavior when a time range is active). Sorting is a separate step
 * now (see sortVideos below) — this function only filters.
 *
 * since = null means "all time" — returned as-is, submission_count
 * stays the all-time value (kept in sync by a DB trigger).
 */
export async function filterVideosByTimeWindow(
  supabase: SupabaseServerClient,
  videos: Video[],
  since: string | null
): Promise<Video[]> {
  if (!since || videos.length === 0) {
    return videos;
  }

  const { data: recentSubmissions, error } = await supabase
    .from("submissions")
    .select("video_id")
    .in(
      "video_id",
      videos.map((v) => v.id)
    )
    .gte("created_at", since);

  if (error) {
    // Fail open: show the unwindowed (all-time) list rather than an
    // empty page if this one extra query has a problem.
    console.error("filterVideosByTimeWindow: submissions query failed", {
      code: error.code,
      message: error.message,
    });
    return videos;
  }

  const windowCounts = new Map<string, number>();
  for (const row of recentSubmissions ?? []) {
    windowCounts.set(row.video_id, (windowCounts.get(row.video_id) ?? 0) + 1);
  }

  return videos
    .filter((v) => (windowCounts.get(v.id) ?? 0) > 0)
    .map((v) => ({ ...v, submission_count: windowCounts.get(v.id) ?? 0 }));
}

export type SortField = "submissions" | "views" | "date" | "votes";
export type SortDirection = "desc" | "asc";

const SORT_PARAM_MAP: Record<string, { field: SortField; direction: SortDirection }> = {
  views_desc: { field: "views", direction: "desc" },
  views_asc: { field: "views", direction: "asc" },
  date_desc: { field: "date", direction: "desc" },
  date_asc: { field: "date", direction: "asc" },
  votes_desc: { field: "votes", direction: "desc" },
  votes_asc: { field: "votes", direction: "asc" },
};

// Default (no ?sort=, or an unrecognized value) is submissions
// descending — the ranking behavior this app already had before sort
// filters existed, for both official and queue categories. Official
// categories just don't display the count anymore (see VideoCard's
// showSubmissionCount prop); the underlying default order is
// unchanged unless the viewer explicitly picks a different sort.
export function parseSortParam(raw: string | undefined): { field: SortField; direction: SortDirection } {
  return (raw && SORT_PARAM_MAP[raw]) || { field: "submissions", direction: "desc" };
}

export function sortParamValue(field: SortField, direction: SortDirection): string {
  return `${field}_${direction}`;
}

// Maps a sort field to the actual videos column to order by at the
// database level. Used so the initial `take`-sized page is already
// pulled in the right priority order for whichever sort is active —
// without this, the base query always fetched the top-`take` by
// submission_count regardless of the chosen sort, so e.g. "Most
// views" would only reorder within that submission-biased subset
// instead of surfacing the actual highest-view videos.
export function sortOrderColumn(field: SortField): string {
  switch (field) {
    case "views":
      return "view_count";
    case "date":
      return "published_at";
    case "votes":
      return "vote_count";
    case "submissions":
    default:
      return "submission_count";
  }
}

export function sortVideos(videos: Video[], field: SortField, direction: SortDirection): Video[] {
  const sign = direction === "asc" ? 1 : -1;

  return [...videos].sort((a, b) => {
    switch (field) {
      case "views":
        return sign * ((a.view_count ?? 0) - (b.view_count ?? 0));
      case "date": {
        const aTime = new Date(a.published_at ?? a.created_at).getTime();
        const bTime = new Date(b.published_at ?? b.created_at).getTime();
        return sign * (aTime - bTime);
      }
      case "votes":
        return sign * (a.vote_count - b.vote_count);
      case "submissions":
      default:
        return sign * (a.submission_count - b.submission_count);
    }
  });
}
