import type { createClient } from "@/lib/supabase/server";
import type { Video } from "@/lib/types/database.types";

// Same pattern already used in app/actions/videos.ts — types against
// createClient()'s own return type rather than importing
// @supabase/supabase-js's SupabaseClient directly.
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Given a base list of videos (already filtered by source+category)
 * and an optional "since" cutoff, returns them ranked by submissions
 * within that window — replicating what the old videos_ranked_by_category()
 * SQL function did, but as plain queries plus JS. This is deliberately
 * NOT a custom RPC: that function broke three separate times against
 * this database (enum/text mismatches, stale signatures), so category
 * ranking now uses the exact same query shape as /videos (requirement
 * 5 — identical fields, since it's the same `.from("videos")` call)
 * plus one extra plain query against `submissions` for the windowed
 * count.
 *
 * since = null means "all time" — the input list's own submission_count
 * (all-time, kept in sync by a DB trigger) is used as-is, unchanged.
 *
 * A non-null since means: count each video's submissions with
 * created_at >= since, drop videos with zero in that window, and sort
 * by that count (ties broken by all-time submission_count) — same
 * semantics as the old SQL's HAVING + ORDER BY.
 */
export async function rankVideosByWindow(
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
    // empty page if this one extra query has a problem. The caller
    // still gets to see/log the underlying error via its own query.
    console.error("rankVideosByWindow: submissions query failed", {
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
    .map((v) => ({ ...v, submission_count: windowCounts.get(v.id) ?? 0, _allTimeCount: v.submission_count }))
    .filter((v) => (windowCounts.get(v.id) ?? 0) > 0)
    .sort((a, b) => {
      if (b.submission_count !== a.submission_count) return b.submission_count - a.submission_count;
      return b._allTimeCount - a._allTimeCount;
    })
    .map(({ _allTimeCount, ...v }) => v);
}
