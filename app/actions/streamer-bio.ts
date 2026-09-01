"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import type { StreamerLink } from "@/lib/types/database.types";

const MAX_BIO_LENGTH = 2000;
const MAX_LINKS = 20;

// Shared by updateStreamerBio() and updateStreamerLinks() — same
// authorization rule for both: streamers.owner_id, or role
// creator/admin. Broader than the streamers table's own RLS write
// policy (creator only), so both actions' actual updates go through
// the admin client rather than the request-scoped one — an owner who
// isn't a creator would otherwise be silently rejected by RLS despite
// passing this app-level check.
// Exported so app/actions/streamer-intro.ts can reuse the exact same
// authorization rule rather than duplicating it.
export async function requireStreamerEditAccess(streamerId: string) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: "You need to sign in." } as const;
  }

  const supabase = await createClient();
  const { data: streamer, error: streamerError } = await supabase
    .from("streamers")
    .select("id, owner_id, slug")
    .eq("id", streamerId)
    .single();

  if (streamerError || !streamer) {
    return { error: "Streamer not found." } as const;
  }

  const canEdit =
    profile.role === "creator" ||
    profile.role === "admin" ||
    (streamer.owner_id != null && streamer.owner_id === profile.id);

  if (!canEdit) {
    return { error: "You don't have permission to edit this streamer's page." } as const;
  }

  return { streamer } as const;
}

export type UpdateBioResult = { error: string } | { success: true; bio: string | null };

export async function updateStreamerBio(streamerId: string, bio: string): Promise<UpdateBioResult> {
  const check = await requireStreamerEditAccess(streamerId);
  if ("error" in check) return check;
  const { streamer } = check;

  // Requirement: plain text only — no [text](url) syntax. There's
  // nothing to strip or parse here; this always was (and remains) a
  // literal, unmodified save of whatever text was typed. Markdown
  // parsing was only ever a *display* concern (lib/bio-markdown.tsx,
  // now removed) — never part of what got saved.
  const trimmed = bio.trim().slice(0, MAX_BIO_LENGTH);

  const admin = createAdminClient();
  const { error } = await admin
    .from("streamers")
    .update({ bio: trimmed || null })
    .eq("id", streamerId);

  if (error) {
    console.error("updateStreamerBio: update failed", {
      streamerId,
      code: error.code,
      message: error.message,
    });
    return { error: `Could not save bio: ${error.message}` };
  }

  revalidatePath(`/streamer/${streamer.slug}`);
  return { success: true, bio: trimmed || null };
}

export type UpdateLinksResult = { error: string } | { success: true; links: StreamerLink[] };

export async function updateStreamerLinks(
  streamerId: string,
  links: StreamerLink[]
): Promise<UpdateLinksResult> {
  const check = await requireStreamerEditAccess(streamerId);
  if ("error" in check) return check;
  const { streamer } = check;

  if (links.length > MAX_LINKS) {
    return { error: `You can have at most ${MAX_LINKS} links.` };
  }

  // Requirement: only http and https — validated here server-side
  // (the form does the same check client-side first, for a faster
  // error, but this is the check that actually matters). Blank rows
  // left over from editing (e.g. "Add link" clicked but never filled
  // in) are dropped silently rather than rejected, since they're not
  // something the person deliberately typed and got wrong.
  const cleaned: StreamerLink[] = [];
  for (const raw of links) {
    const label = (raw.label ?? "").trim();
    const url = (raw.url ?? "").trim();

    if (!label && !url) continue; // fully blank row, drop silently

    if (!label) {
      return { error: `A link with url "${url}" is missing a label.` };
    }
    if (!/^https?:\/\//i.test(url)) {
      return { error: `The link "${label}" needs a URL starting with http:// or https://.` };
    }

    cleaned.push({ label, url });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("streamers")
    .update({ links: cleaned.length > 0 ? cleaned : null })
    .eq("id", streamerId);

  if (error) {
    console.error("updateStreamerLinks: update failed", {
      streamerId,
      code: error.code,
      message: error.message,
    });
    return { error: `Could not save links: ${error.message}` };
  }

  revalidatePath(`/streamer/${streamer.slug}`);
  return { success: true, links: cleaned };
}
