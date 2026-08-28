"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { extractYoutubeId, fetchYoutubeMetadata } from "@/lib/youtube";

export type SubmitVideoResult = { error: string } | { success: true };

export async function submitVideo(url: string): Promise<SubmitVideoResult> {
  // Feature: only logged-in users can submit. getCurrentProfile()
  // reads the session server-side, so this can't be bypassed from the
  // client no matter what the form sends.
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: "You need to sign in to submit a video." };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return { error: "Paste a YouTube URL first." };
  }

  const videoId = extractYoutubeId(trimmed);
  if (!videoId) {
    return { error: "That doesn't look like a valid YouTube video URL." };
  }

  // Fetch title/thumbnail/channel from the YouTube Data API v3.
  // fetchYoutubeMetadata() never throws — it returns null on any
  // failure (missing key, network error, private/deleted video) — so
  // a metadata failure never blocks the submission itself; we just
  // fall through with nulls, same as before this feature existed.
  const metadata = await fetchYoutubeMetadata(videoId);

  const supabase = await createClient();

  // submit_video() atomically creates-or-updates the video row and
  // inserts a submissions row for the current user. The DB's
  // unique(video_id, user_id) constraint stops the same user from
  // submitting the same video twice.
  const { error } = await supabase.rpc("submit_video", {
    p_youtube_id: videoId,
    p_title: metadata?.title ?? null,
    p_thumbnail_url: metadata?.thumbnailUrl ?? null,
    p_channel_name: metadata?.channelName ?? null,
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
