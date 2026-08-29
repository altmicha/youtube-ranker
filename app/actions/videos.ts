"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { extractYoutubeId, fetchYoutubeMetadata } from "@/lib/youtube";
import { SELECTABLE_CATEGORIES, type SelectableVideoCategory } from "@/lib/types/database.types";

export type SubmitVideoResult = { error: string } | { success: true };

export async function submitVideo(
  url: string,
  category: SelectableVideoCategory
): Promise<SubmitVideoResult> {
  // Feature: only logged-in users can submit. getCurrentProfile()
  // reads the session server-side, so this can't be bypassed from the
  // client no matter what the form sends.
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: "You need to sign in to submit a video." };
  }

  // Requirement 5: category is required. Re-validated here against
  // the currently-selectable list (not the full DB enum, which still
  // includes retired categories like "Variety" used only as an
  // internal fallback) — a request built by hand with a retired or
  // bogus value is rejected here rather than silently succeeding.
  if (!SELECTABLE_CATEGORIES.includes(category)) {
    return { error: "Choose a valid category." };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return { error: "Paste a YouTube URL first." };
  }

  const videoId = extractYoutubeId(trimmed);
  if (!videoId) {
    return { error: "That doesn't look like a valid YouTube video URL." };
  }

  const supabase = await createClient();

  // Rate limit: normal users can submit at most 3 videos per hour,
  // per category (3 Funny + 3 Gaming in the same hour is fine; a 4th
  // Funny isn't). Creators are exempt (same profile.role check used
  // everywhere else). Enforced here, in the server action — this
  // can't be bypassed by disabling/hiding the submit button, since
  // the check runs regardless of what the client sends.
  //
  // submissions doesn't store category itself (a video's category is
  // fixed on the videos row, not per-submission), so this counts via
  // an inner-joined embed — videos!inner(category) — filtering on the
  // embedded video's category through PostgREST's dot-notation filter.
  if (profile.role !== "creator") {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("submissions")
      .select("id, videos!inner(category)", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("videos.category", category)
      .gte("created_at", oneHourAgo);

    if (countError) {
      return { error: "Something went wrong. Try again." };
    }
    if ((count ?? 0) >= 3) {
      return { error: "You can only submit 3 videos per hour in this category." };
    }
  }

  // Fetch title/thumbnail/channel/stats from the YouTube Data API v3.
  // fetchYoutubeMetadata() never throws — it returns null on any
  // failure (missing key, network error, private/deleted video) — so
  // a metadata/stats failure never blocks the submission itself; we
  // just fall through with nulls (requirement 6).
  const metadata = await fetchYoutubeMetadata(videoId);

  // submit_video() atomically creates-or-updates the video row and
  // inserts a submissions row for the current user. The DB's
  // unique(video_id, user_id) constraint stops the same user from
  // submitting the same video twice. If the video already exists,
  // the category passed here is ignored (first submitter's choice
  // sticks), but view/like/dislike counts always take this fresher
  // fetch when available — see schema.sql.
  const { error } = await supabase.rpc("submit_video", {
    p_youtube_id: videoId,
    p_title: metadata?.title ?? null,
    p_thumbnail_url: metadata?.thumbnailUrl ?? null,
    p_channel_name: metadata?.channelName ?? null,
    p_category: category,
    p_view_count: metadata?.viewCount ?? null,
    p_like_count: metadata?.likeCount ?? null,
    p_dislike_count: metadata?.dislikeCount ?? null,
    p_published_at: metadata?.publishedAt ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      // unique_violation
      return { error: "You've already submitted this video." };
    }
    return { error: "Something went wrong saving that video. Try again." };
  }

  revalidatePath("/");
  revalidatePath("/creator");
  return { success: true };
}

export type RemoveVideoResult = { error: string } | { success: true };

export async function removeVideo(videoId: string): Promise<RemoveVideoResult> {
  // Creator-only. Checked here as a fast, friendly failure path —
  // remove_video() in schema.sql independently re-checks the caller's
  // role too, so a client can't bypass this by calling the action
  // some other way. There is no public update policy on videos, so
  // this function is the only path that can set is_removed.
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: "You need to sign in." };
  }
  if (profile.role !== "creator") {
    return { error: "Only creators can remove videos." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("remove_video", {
    p_video_id: videoId,
  });

  if (error) {
    return { error: `Remove failed: ${error.message}` };
  }

  // Removed videos are filtered out of both the homepage and creator
  // dashboard queries (is_removed = false), so revalidating both
  // paths makes them disappear immediately.
  revalidatePath("/");
  revalidatePath("/creator");
  return { success: true };
}
