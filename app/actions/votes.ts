"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";

export type UpvoteResult = { error: string } | { success: true };

export async function upvoteVideo(videoId: string): Promise<UpvoteResult> {
  // Feature 5: only logged-in users can upvote. Checked server-side so
  // this can't be bypassed by calling the action directly.
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: "You need to sign in to upvote." };
  }

  const supabase = await createClient();

  // Feature 2: one vote per user per video. The votes table has a
  // unique(video_id, user_id) constraint, so a duplicate insert fails
  // with a 23505 (unique_violation) rather than creating a second vote
  // — this is the source of truth, not just a UI-level check.
  const { error } = await supabase
    .from("votes")
    .insert({ video_id: videoId, user_id: profile.id });

  if (error) {
    if (error.code === "23505") {
      return { error: "You've already upvoted this video." };
    }
    return { error: "Something went wrong. Try again." };
  }

  // vote_count on the video row is kept in sync by the
  // on_vote_change trigger in schema.sql — no manual increment needed.
  revalidatePath("/");
  return { success: true };
}

export async function removeUpvote(videoId: string): Promise<UpvoteResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: "You need to sign in to remove your upvote." };
  }

  const supabase = await createClient();

  // The "users can remove their own vote" RLS policy on votes (see
  // schema.sql) restricts this delete to auth.uid() = user_id, so a
  // request can only ever remove the caller's own vote.
  const { error } = await supabase
    .from("votes")
    .delete()
    .eq("video_id", videoId)
    .eq("user_id", profile.id);

  if (error) {
    return { error: "Something went wrong. Try again." };
  }

  // vote_count is decremented automatically by the on_vote_change
  // trigger when the row is deleted.
  revalidatePath("/");
  return { success: true };
}
