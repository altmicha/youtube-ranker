"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { categorySlug } from "@/lib/categories";
import { ensureTopDailyClipsCategory } from "@/lib/top-daily-clips";
import type { Streamer } from "@/lib/types/database.types";

// Same creator-only gate as app/actions/categories.ts. Fast, friendly
// failure path here — the streamers table's own RLS policies (see
// add_streamer_management.sql) independently re-check the same thing
// at the database level for every write, so this can't be bypassed by
// calling an action some other way.
async function requireCreatorProfile() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You need to sign in." } as const;
  if (profile.role !== "creator") return { error: "Only creators can manage streamers." } as const;
  return { profile } as const;
}

// A streamer is no longer platform-specific (it can have both
// YouTube and Twitch categories), so there's nothing to scope
// revalidation to — just refresh everywhere a streamer's name/image
// could show up.
function revalidateStreamerPages(slug?: string) {
  revalidatePath("/youtube");
  revalidatePath("/twitch");
  revalidatePath("/youtube/[slug]", "page");
  revalidatePath("/twitch/[slug]", "page");
  revalidatePath("/creator");
  revalidatePath("/"); // homepage streamer directory
  if (slug) revalidatePath(`/streamer/${slug}`);
}

export type StreamerActionResult = { error: string } | { success: true; streamer: Streamer };

export async function createStreamer(
  name: string,
  slug: string,
  bio: string,
  twitchLogin: string,
  ownerId: string
): Promise<StreamerActionResult> {
  const check = await requireCreatorProfile();
  if ("error" in check) return check;

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: "Enter a streamer name." };
  }

  // Normalized the same way category slugs are (lowercase, hyphenated,
  // stripped of anything unsafe for a URL) — the field is free text
  // from the creator, this just makes sure what's stored is usable.
  const normalizedSlug = categorySlug(slug);
  if (!normalizedSlug) {
    return { error: "Enter a valid slug (letters, numbers, hyphens)." };
  }

  const supabase = await createClient();
  // platform intentionally omitted — streamers aren't platform-scoped
  // anymore, so this column is left null (see
  // make_streamer_platform_optional.sql).
  const { data, error } = await supabase
    .from("streamers")
    .insert({
      display_name: trimmedName,
      slug: normalizedSlug,
      bio: bio.trim() || null,
      // Twitch usernames are lowercase-normalized on their end too;
      // stored lowercase here so it matches what
      // lib/twitch.ts's fetchTwitchLiveStatuses() looks up by.
      twitch_login: twitchLogin.trim() ? twitchLogin.trim().toLowerCase() : null,
      // Optional — the Owner field on /creator is not required, so an
      // empty selection just leaves this null.
      owner_id: ownerId || null,
    })
    .select()
    .single();

  if (error) {
    console.error("createStreamer: insert into streamers failed", {
      name: trimmedName,
      slug: normalizedSlug,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    if (error.code === "23505") {
      return { error: "A streamer with that slug already exists." };
    }
    if (error.code === "42501") {
      return {
        error:
          "Permission denied by the database (row-level security). Confirm this account's role is set to 'creator' in the profiles table, and that the SQL in add_streamer_management.sql has been run.",
      };
    }
    return { error: `Could not create streamer: ${error.message}` };
  }

  revalidateStreamerPages(normalizedSlug);

  // Requirement: new streamers with twitch_login must automatically
  // get their "Top daily clips" category — created here immediately
  // (creator's own session already has permission for this, being an
  // official category), rather than waiting for the first background
  // refresh. The clips themselves still only show up once a refresh
  // actually runs (creator opening /creator, or that category's own
  // page loading) — this just makes sure the category (and therefore
  // its URL) exists right away instead of only after the first clip.
  if (data.twitch_login) {
    await ensureTopDailyClipsCategory(supabase, { id: data.id, slug: data.slug });
  }

  return { success: true, streamer: data };
}

export type SimpleActionResult = { error: string } | { success: true };

export async function updateStreamer(
  streamerId: string,
  slug: string,
  name: string,
  bio: string,
  twitchLogin: string,
  ownerId: string
): Promise<SimpleActionResult> {
  const check = await requireCreatorProfile();
  if ("error" in check) return check;

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: "Enter a streamer name." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("streamers")
    .update({
      display_name: trimmedName,
      bio: bio.trim() || null,
      twitch_login: twitchLogin.trim() ? twitchLogin.trim().toLowerCase() : null,
      owner_id: ownerId || null,
    })
    .eq("id", streamerId);

  if (error) {
    console.error("updateStreamer: update failed", {
      streamerId,
      code: error.code,
      message: error.message,
    });
    if (error.code === "42501") {
      return {
        error:
          "Permission denied by the database (row-level security). Confirm this account's role is set to 'creator' in the profiles table.",
      };
    }
    return { error: `Could not update streamer: ${error.message}` };
  }

  revalidateStreamerPages(slug);

  // Same as createStreamer(): make sure a twitch_login added here
  // (whether newly set or already there) has its category ready.
  const normalizedTwitchLogin = twitchLogin.trim() ? twitchLogin.trim().toLowerCase() : null;
  if (normalizedTwitchLogin) {
    await ensureTopDailyClipsCategory(supabase, { id: streamerId, slug });
  }

  return { success: true };
}

export async function removeStreamer(
  streamerId: string,
  slug: string
): Promise<SimpleActionResult> {
  const check = await requireCreatorProfile();
  if ("error" in check) return check;

  const supabase = await createClient();

  // Categories requiring a streamer only applies going forward at the
  // app/form level (categories.streamer_id stays nullable in the DB
  // on purpose). Removing a streamer that still has categories
  // pointing at it would otherwise fail on the FK constraint, so
  // clear those categories back to "no streamer assigned" first —
  // same "don't destroy the thing that references it" precedent as
  // remove_category() clearing category off videos. This now clears
  // categories across BOTH platforms, since a streamer can have both.
  const { error: unassignError } = await supabase
    .from("categories")
    .update({ streamer_id: null })
    .eq("streamer_id", streamerId);

  if (unassignError) {
    console.error("removeStreamer: clearing categories.streamer_id failed", {
      streamerId,
      code: unassignError.code,
      message: unassignError.message,
    });
    return { error: `Could not remove streamer: ${unassignError.message}` };
  }

  const { error } = await supabase.from("streamers").delete().eq("id", streamerId);

  if (error) {
    console.error("removeStreamer: delete failed", {
      streamerId,
      code: error.code,
      message: error.message,
    });
    if (error.code === "42501") {
      return {
        error:
          "Permission denied by the database (row-level security). Confirm this account's role is set to 'creator' in the profiles table.",
      };
    }
    return { error: `Could not remove streamer: ${error.message}` };
  }

  revalidateStreamerPages(slug);
  revalidatePath("/videos");
  return { success: true };
}

export async function uploadStreamerCoverImage(
  streamerId: string,
  slug: string,
  formData: FormData
): Promise<SimpleActionResult> {
  const check = await requireCreatorProfile();
  if ("error" in check) return check;

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file first." };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "That file doesn't look like an image." };
  }
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB — same cap as category images
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Image is too large — please use a file under 2MB." };
  }

  const supabase = await createClient();

  // Same pattern as category images: path is just the streamer's own
  // id, no extension, upsert overwrites in place on re-upload.
  const path = streamerId;

  const { error: uploadError } = await supabase.storage
    .from("streamer-covers")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    console.error("uploadStreamerCoverImage: storage upload failed", {
      streamerId,
      message: uploadError.message,
    });
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { error: updateError } = await supabase
    .from("streamers")
    .update({ cover_path: path })
    .eq("id", streamerId);

  if (updateError) {
    console.error("uploadStreamerCoverImage: streamers update failed", {
      streamerId,
      code: updateError.code,
      message: updateError.message,
    });
    if (updateError.code === "42501") {
      return {
        error:
          "Image uploaded, but permission was denied saving it to the streamer. Confirm this account's role is set to 'creator' in the profiles table.",
      };
    }
    return { error: `Image uploaded, but saving it to the streamer failed: ${updateError.message}` };
  }

  revalidateStreamerPages(slug);
  return { success: true };
}
