"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { extractYoutubeId, fetchYoutubeMetadata } from "@/lib/youtube";
import { extractTwitchClipSlug, fetchTwitchClipMetadata } from "@/lib/twitch";
import {
  YOUTUBE_SELECTABLE_CATEGORIES,
  TWITCH_SELECTABLE_CATEGORIES,
  type SelectableVideoCategory,
  type YoutubeSelectableCategory,
  type TwitchSelectableCategory,
  type VideoSource,
} from "@/lib/types/database.types";

export type SubmitVideoResult = { error: string } | { success: true };

export async function submitVideo(
  url: string,
  category: SelectableVideoCategory,
  platform: VideoSource
): Promise<SubmitVideoResult> {
  // Feature: only logged-in users can submit. getCurrentProfile()
  // reads the session server-side, so this can't be bypassed from the
  // client no matter what the form sends.
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: "You need to sign in to submit a video." };
  }

  // Category is required, and validated against the SPECIFIC
  // platform's allowed list — not the shared full set. This is what
  // stops e.g. a hand-built request from submitting a YouTube video
  // under "Cop Slop" via the /twitch form's action call, since
  // TWITCH_SELECTABLE_CATEGORIES doesn't include it.
  const allowedCategories: readonly SelectableVideoCategory[] =
    platform === "youtube" ? YOUTUBE_SELECTABLE_CATEGORIES : TWITCH_SELECTABLE_CATEGORIES;
  if (!allowedCategories.includes(category)) {
    return { error: "Choose a valid category for this page." };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return {
      error: platform === "youtube" ? "Paste a YouTube URL first." : "Paste a Twitch clip URL first.",
    };
  }

  // Detect YouTube vs Twitch from the URL, then check it matches the
  // page the form was submitted from — pasting the wrong type of
  // link on either page is a clear error rather than silently
  // accepting it or guessing which page they "meant".
  const youtubeId = extractYoutubeId(trimmed);
  const twitchSlug = youtubeId ? null : extractTwitchClipSlug(trimmed);

  if (!youtubeId && !twitchSlug) {
    return {
      error:
        platform === "youtube"
          ? "That doesn't look like a valid YouTube video URL."
          : "That doesn't look like a valid Twitch clip URL.",
    };
  }
  if (platform === "youtube" && !youtubeId) {
    return { error: "That's a Twitch clip URL — submit it on the Twitch page instead." };
  }
  if (platform === "twitch" && !twitchSlug) {
    return { error: "That's a YouTube URL — submit it on the YouTube page instead." };
  }

  const supabase = await createClient();

  // Rate limit: normal users can submit at most 3 videos per hour,
  // per category AND per platform (3 YouTube LSF + 3 Twitch LSF in
  // the same hour is fine — they're independent buckets, since the
  // two platforms are now clearly separate pages/experiences; a 4th
  // YouTube LSF isn't). Creators are exempt.
  if (profile.role !== "creator") {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("submissions")
      .select("id, videos!inner(category, source)", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("videos.category", category)
      .eq("videos.source", platform)
      .gte("created_at", oneHourAgo);

    if (countError) {
      return { error: "Something went wrong. Try again." };
    }
    if ((count ?? 0) >= 3) {
      return { error: "You can only submit 3 videos per hour in this category." };
    }
  }

  if (youtubeId) {
    return submitYoutubeVideo(supabase, youtubeId, category as (typeof YOUTUBE_SELECTABLE_CATEGORIES)[number]);
  }
  return submitTwitchClip(supabase, twitchSlug!, category as (typeof TWITCH_SELECTABLE_CATEGORIES)[number]);
}

// Awaited return type of createClient() — kept local rather than
// exported, just to type the two helpers below without repeating the
// whole createClient() call signature.
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function submitYoutubeVideo(
  supabase: SupabaseServerClient,
  videoId: string,
  category: YoutubeSelectableCategory
): Promise<SubmitVideoResult> {
  // Fetch title/thumbnail/channel/stats from the YouTube Data API v3.
  // fetchYoutubeMetadata() never throws — it returns null on any
  // failure (missing key, network error, private/deleted video) — so
  // a metadata/stats failure never blocks the submission itself; we
  // just fall through with nulls.
  const metadata = await fetchYoutubeMetadata(videoId);

  // submit_video() atomically creates-or-updates the video row and
  // inserts a submissions row for the current user. The DB's
  // unique(video_id, user_id) constraint stops the same user from
  // submitting the same video twice. If the video already exists,
  // the category passed here is ignored (first submitter's choice
  // sticks), but view/like/dislike counts always take this fresher
  // fetch when available — see schema.sql. This is the exact same
  // call as before Twitch support existed — nothing about the
  // YouTube path changed.
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
      return { error: "You've already submitted this video." };
    }
    return { error: "Something went wrong saving that video. Try again." };
  }

  revalidatePath("/youtube");
  revalidatePath("/creator");
  return { success: true };
}

async function submitTwitchClip(
  supabase: SupabaseServerClient,
  slug: string,
  category: TwitchSelectableCategory
): Promise<SubmitVideoResult> {
  // Fetch title/thumbnail/broadcaster/view count from Twitch Helix.
  // Same fail-open contract as the YouTube fetch: never throws,
  // returns null on any failure, so a metadata failure never blocks
  // the submission itself.
  const metadata = await fetchTwitchClipMetadata(slug);

  const { error } = await supabase.rpc("submit_twitch_clip", {
    p_slug: slug,
    p_title: metadata?.title ?? null,
    p_thumbnail_url: metadata?.thumbnailUrl ?? null,
    p_broadcaster_name: metadata?.broadcasterName ?? null,
    p_category: category,
    p_view_count: metadata?.viewCount ?? null,
    p_published_at: metadata?.createdAt ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You've already submitted this clip." };
    }
    return { error: "Something went wrong saving that clip. Try again." };
  }

  revalidatePath("/twitch");
  revalidatePath("/creator");
  return { success: true };
}

export type RemoveVideoResult = { error: string } | { success: true };

export async function removeVideo(videoId: string): Promise<RemoveVideoResult> {
  // Creator-only. Checked here as a fast, friendly failure path —
  // remove_video() in schema.sql independently re-checks the caller's
  // role too, so a client can't bypass this by calling the action
  // some other way. There is no public update policy on videos, so
  // this function is the only path that can set is_removed. Untouched
  // by Twitch support — remove_video() operates purely on video_id,
  // so it already works identically for both sources.
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

  // Removed videos are filtered out of the platform pages, category
  // pages, and creator dashboard (is_removed = false), so revalidating
  // those paths makes them disappear immediately. The homepage itself
  // no longer shows any video content, so there's nothing to
  // revalidate there anymore.
  revalidatePath("/youtube");
  revalidatePath("/twitch");
  revalidatePath("/creator");
  return { success: true };
}
