"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";

const POINTS_PER_SUBMITTER = 10;

export type AwardPointsResult =
  | { error: string; alreadyAwarded?: boolean }
  | { success: true; awardedCount: number };

export async function awardPointsForVideo(
  videoId: string
): Promise<AwardPointsResult> {
  // Feature: creator-only. Checked here as a fast, friendly failure
  // path — award_points_for_video() in schema.sql independently
  // re-checks the caller's role too, so this isn't the only guard.
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: "You need to sign in." };
  }
  if (profile.role !== "creator") {
    return { error: "Only creators can award points." };
  }

  const supabase = await createClient();

  // award_points_for_video() does everything in one atomic DB
  // transaction: it first inserts a (video_id, creator_id) claim row
  // into video_creator_awards (whose primary key enforces "once per
  // creator per video" — see schema.sql), then pays out every unique
  // submitter. If this creator already awarded this video, the claim
  // insert fails with 23505 and NOTHING gets paid out — including
  // under a race from a rapid double click.
  const { data, error } = await supabase.rpc("award_points_for_video", {
    p_video_id: videoId,
    p_points: POINTS_PER_SUBMITTER,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "You've already awarded points for this video.",
        alreadyAwarded: true,
      };
    }
    // Surface the actual DB error (e.g. "function
    // award_points_for_video(...) does not exist" if the schema.sql
    // migration for this feature hasn't been run yet in Supabase)
    // instead of hiding it behind a generic message — this is much
    // faster to debug than guessing.
    return { error: `Award failed: ${error.message}` };
  }

  revalidatePath("/creator");
  revalidatePath("/");

  return { success: true, awardedCount: data ?? 0 };
}

export type UndoAwardResult = { error: string } | { success: true; undoneCount: number };

export async function undoAwardForVideo(
  videoId: string
): Promise<UndoAwardResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: "You need to sign in." };
  }
  if (profile.role !== "creator") {
    return { error: "Only creators can undo awards." };
  }

  const supabase = await createClient();

  // undo_award_for_video() atomically deletes the point_awards rows
  // this creator made for this video, deducts those points back off
  // each recipient, and removes the video_creator_awards claim so the
  // video becomes awardable again. It also re-checks (server-side)
  // that this creator actually has a claim on this video before doing
  // anything, so it can't be used to undo someone else's award.
  const { data, error } = await supabase.rpc("undo_award_for_video", {
    p_video_id: videoId,
  });

  if (error) {
    return { error: `Undo failed: ${error.message}` };
  }

  revalidatePath("/creator");
  revalidatePath("/");

  return { success: true, undoneCount: data ?? 0 };
}
