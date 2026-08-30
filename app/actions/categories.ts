"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { categorySlug } from "@/lib/categories";
import type { VideoSource, Category } from "@/lib/types/database.types";

// Every action in this file starts with the same check: only
// role = 'creator' can manage categories. This is the fast, friendly
// failure path — the categories table's own RLS policies (see
// schema.sql) independently re-check the same thing at the database
// level for every insert/update/delete, so this can't be bypassed by
// calling an action some other way.
async function requireCreatorProfile() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You need to sign in." } as const;
  if (profile.role !== "creator") return { error: "Only creators can manage categories." } as const;
  return { profile } as const;
}

function revalidatePlatform(platform: VideoSource) {
  revalidatePath(platform === "youtube" ? "/youtube" : "/twitch");
  revalidatePath("/creator");
}

export type CategoryActionResult = { error: string } | { success: true; category: Category };

export async function createCategory(
  platform: VideoSource,
  name: string,
  streamerId: string
): Promise<CategoryActionResult> {
  const check = await requireCreatorProfile();
  if ("error" in check) return check;

  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "Enter a category name." };
  }

  const slug = categorySlug(trimmed);
  if (!slug) {
    return { error: "That name doesn't produce a valid URL — try something with letters or numbers." };
  }

  // Requirement: adding a category requires picking a streamer.
  if (!streamerId) {
    return { error: "Choose a streamer for this category." };
  }

  const supabase = await createClient();

  // Confirm the streamer is real and actually belongs to this
  // platform (a YouTube category shouldn't end up pointing at a
  // Twitch streamer) before writing anything.
  const { data: streamer, error: streamerError } = await supabase
    .from("streamers")
    .select("id, platform")
    .eq("id", streamerId)
    .single();

  if (streamerError || !streamer || streamer.platform !== platform) {
    return { error: "Choose a valid streamer for this platform." };
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({ platform, name: trimmed, slug, streamer_id: streamerId })
    .select()
    .single();

  if (error) {
    // Requirement 1: log the actual Supabase error server-side (shows
    // up in your Vercel function logs / local dev console).
    console.error("createCategory: insert into categories failed", {
      platform,
      name: trimmed,
      slug,
      streamerId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    if (error.code === "23505") {
      return { error: `A ${platform === "youtube" ? "YouTube" : "Twitch"} category with that name already exists.` };
    }
    if (error.code === "42501") {
      // RLS rejected the insert — almost always means this account's
      // profiles.role isn't actually 'creator' in the database, even
      // if the UI thinks it is.
      return {
        error:
          "Permission denied by the database (row-level security). Confirm this account's role is set to 'creator' in the profiles table.",
      };
    }
    // Requirement 2: show the real error instead of a generic one.
    return { error: `Could not create category: ${error.message}` };
  }

  revalidatePlatform(platform);
  return { success: true, category: data };
}

export type SimpleActionResult = { error: string } | { success: true };

export async function updateCategory(
  categoryId: string,
  newName: string,
  streamerId: string,
  platform: VideoSource
): Promise<SimpleActionResult> {
  const check = await requireCreatorProfile();
  if ("error" in check) return check;

  const trimmed = newName.trim();
  if (!trimmed) {
    return { error: "Enter a category name." };
  }

  // Requirement: editing a category requires picking a streamer too —
  // including for older categories that predate this and currently
  // have no streamer assigned.
  if (!streamerId) {
    return { error: "Choose a streamer for this category." };
  }

  const supabase = await createClient();

  const { data: streamer, error: streamerError } = await supabase
    .from("streamers")
    .select("id, platform")
    .eq("id", streamerId)
    .single();

  if (streamerError || !streamer || streamer.platform !== platform) {
    return { error: "Choose a valid streamer for this platform." };
  }

  // Slug intentionally not touched — renaming keeps existing
  // /youtube/<slug> or /twitch/<slug> links working, and videos are
  // linked to the category by that same slug (see schema.sql), so
  // they're unaffected by a rename either way.
  const { error } = await supabase
    .from("categories")
    .update({ name: trimmed, streamer_id: streamerId })
    .eq("id", categoryId);

  if (error) {
    console.error("updateCategory: update failed", {
      categoryId,
      newName: trimmed,
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
    return { error: `Could not update category: ${error.message}` };
  }

  revalidatePlatform(platform);
  return { success: true };
}

export async function removeCategory(
  categoryId: string,
  platform: VideoSource
): Promise<SimpleActionResult> {
  const check = await requireCreatorProfile();
  if ("error" in check) return check;

  const supabase = await createClient();
  // Videos now reference a category by its plain slug (text), not
  // category_id — see schema.sql — so deleting the categories row
  // directly wouldn't clear anything off videos.category anymore.
  // remove_category() does both atomically: clears category/
  // category_id off every video that referenced this one (by source
  // + slug), then deletes the category row. It also independently
  // re-checks the caller is a creator, same defense-in-depth pattern
  // as every other privileged write in this app.
  const { error } = await supabase.rpc("remove_category", {
    p_category_id: categoryId,
  });

  if (error) {
    console.error("removeCategory: remove_category RPC failed", {
      categoryId,
      code: error.code,
      message: error.message,
    });
    return { error: `Could not remove category: ${error.message}` };
  }

  revalidatePlatform(platform);
  revalidatePath("/videos");
  return { success: true };
}

export async function uploadCategoryImage(
  categoryId: string,
  platform: VideoSource,
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
  // Requirement 6: cap category images — these render at a small
  // fixed 144×192px card size, so there's no reason to store/serve a
  // multi-megabyte original. Rejecting oversized uploads here (rather
  // than silently accepting and slowing down every page that shows
  // this card) is the safe fix that needs no new dependencies — actual
  // server-side resizing would need an image library this project
  // doesn't have.
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Image is too large — please use a file under 2MB." };
  }

  const supabase = await createClient();

  // Path is just the category's own id — no extension, since Storage
  // serves the correct Content-Type from the upload's own metadata,
  // not the object key. Using a fixed, extension-less key means
  // re-uploading (even a different image format) always overwrites
  // the same object in place via upsert, rather than leaving old
  // files behind under a different key.
  const path = categoryId;

  const { error: uploadError } = await supabase.storage
    .from("category-covers")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    console.error("uploadCategoryImage: storage upload failed", {
      categoryId,
      message: uploadError.message,
    });
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { error: updateError } = await supabase
    .from("categories")
    .update({ image_path: path })
    .eq("id", categoryId);

  if (updateError) {
    console.error("uploadCategoryImage: categories update failed", {
      categoryId,
      code: updateError.code,
      message: updateError.message,
    });
    if (updateError.code === "42501") {
      return {
        error:
          "Image uploaded, but permission was denied saving it to the category. Confirm this account's role is set to 'creator' in the profiles table.",
      };
    }
    return { error: `Image uploaded, but saving it to the category failed: ${updateError.message}` };
  }

  revalidatePlatform(platform);
  return { success: true };
}
