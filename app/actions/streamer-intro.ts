"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { parseIntroUrl } from "@/lib/intro-embed";
import { requireStreamerEditAccess } from "@/app/actions/streamer-bio";

export type UpdateIntroResult = { error: string } | { success: true; introUrl: string | null };

export async function updateStreamerIntro(streamerId: string, url: string): Promise<UpdateIntroResult> {
  const check = await requireStreamerEditAccess(streamerId);
  if ("error" in check) return check;
  const { streamer } = check;

  const trimmed = url.trim();
  if (!trimmed) {
    return { error: "Enter a YouTube or Twitch URL." };
  }

  // Requirement: accept youtube.com/youtu.be and twitch.tv clips or
  // videos — this is the actual authority (parseIntroUrl is the same
  // function the display side uses to decide what to embed), not just
  // a client-side nicety.
  if (!parseIntroUrl(trimmed)) {
    return { error: "That doesn't look like a YouTube or Twitch clip/video URL." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("streamers").update({ intro_url: trimmed }).eq("id", streamerId);

  if (error) {
    console.error("updateStreamerIntro: update failed", {
      streamerId,
      code: error.code,
      message: error.message,
    });
    return { error: `Could not save intro link: ${error.message}` };
  }

  revalidatePath(`/streamer/${streamer.slug}`);
  return { success: true, introUrl: trimmed };
}

export async function removeStreamerIntro(streamerId: string): Promise<UpdateIntroResult> {
  const check = await requireStreamerEditAccess(streamerId);
  if ("error" in check) return check;
  const { streamer } = check;

  const admin = createAdminClient();
  const { error } = await admin.from("streamers").update({ intro_url: null }).eq("id", streamerId);

  if (error) {
    console.error("removeStreamerIntro: update failed", {
      streamerId,
      code: error.code,
      message: error.message,
    });
    return { error: `Could not remove intro link: ${error.message}` };
  }

  revalidatePath(`/streamer/${streamer.slug}`);
  return { success: true, introUrl: null };
}
