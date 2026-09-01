"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { categorySlug } from "@/lib/categories";
import type { VideoSource, Category, CategoryKind } from "@/lib/types/database.types";

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
  streamerId: string,
  kind: CategoryKind
): Promise<CategoryActionResult> {
  // Different permission rule depending on kind, so this doesn't use
  // the shared requireCreatorProfile() above (that's creator-only,
  // still exactly right for updateCategory/removeCategory/
  // uploadCategoryImage below — none of those changed). Official
  // categories: creator only, as before. Queue categories: creator OR
  // streamer. The categories table's own RLS policy enforces the same
  // split at the database level (see add_category_kind.sql) — this
  // is the fast, friendly failure path, not the only guard.
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: "You need to sign in." };
  }
  const allowed =
    kind === "queue"
      ? profile.role === "creator" || profile.role === "streamer"
      : profile.role === "creator";
  if (!allowed) {
    return {
      error:
        kind === "queue"
          ? "Only creators or streamers can add a reaction queue category."
          : "Only creators can add official categories.",
    };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "Enter a category name." };
  }

  const bareSlug = categorySlug(trimmed);
  if (!bareSlug) {
    return { error: "That name doesn't produce a valid URL — try something with letters or numbers." };
  }

  // Requirement: adding a category requires picking a streamer.
  if (!streamerId) {
    return { error: "Choose a streamer for this category." };
  }

  const supabase = await createClient();

  // Confirm the streamer is real (streamers aren't platform-scoped
  // anymore — a single streamer can have both YouTube and Twitch
  // categories — so there's no platform match to check here, unlike
  // before). Also need the streamer's own slug now, for the suffix
  // below.
  const { data: streamer, error: streamerError } = await supabase
    .from("streamers")
    .select("id, slug")
    .eq("id", streamerId)
    .single();

  if (streamerError || !streamer) {
    return { error: "Choose a valid streamer." };
  }

  // Requirement: "Official LSF" on xQc and "Official LSF" on LIRIK
  // must both save. The categories table's unique index on
  // (platform, kind, slug) is global — no streamer_id in it — so two
  // categories with the same name from different streamers would
  // otherwise collide on the exact same bare slug ("lsf" for both).
  // Suffixing with the streamer's own slug makes this collision
  // structurally impossible rather than something to detect and
  // reject: lsf-xqc vs lsf-lirik. Same pattern already used for the
  // auto-managed Top daily clips / Featured clips categories (see
  // lib/top-daily-clips.ts's topDailyClipsSlug() and
  // lib/featured-clips.ts's featuredClipsSlug()).
  const slug = `${bareSlug}-${streamer.slug}`;

  // Requirement: only error if this exact name already exists for
  // THIS streamer, in THIS section (platform + kind) — matches the
  // unique index on (streamer_id, platform, kind, lower(name)).
  // Checked explicitly first so "Official 'funny clips'" and "Queue
  // 'funny clips'" for the same streamer both succeed (different
  // kind = no conflict), with a clean, accurate error message before
  // ever hitting the database constraint. Compared in JS rather than
  // via .ilike() — ilike treats % and _ in the name as wildcards,
  // which could false-match names containing those characters.
  const { data: siblingCategories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("streamer_id", streamerId)
    .eq("platform", platform)
    .eq("kind", kind);

  const existing = siblingCategories?.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    return { error: `A ${kind} category named "${trimmed}" already exists for this streamer.` };
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({ platform, name: trimmed, slug, streamer_id: streamerId, kind })
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
      kind,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    if (error.code === "23505") {
      // Requirement: the "taken by another streamer's category" error
      // is gone — with the slug fix above, this specific collision
      // (same name, different streamer) can no longer occur, since
      // each streamer's slug is now unique by construction. If a
      // 23505 still happens here, it's some other conflict — most
      // likely a genuine duplicate request — not something worth
      // presuming the cause of.
      return {
        error: `Could not create this category — it may already exist. Try a different name.`,
      };
    }
    if (error.code === "42501") {
      // RLS rejected the insert — either this account's profiles.role
      // doesn't actually match what's needed for this kind, or
      // add_category_kind.sql's updated RLS policy hasn't been run yet.
      return {
        error:
          "Permission denied by the database (row-level security). Confirm this account's role, and that add_category_kind.sql has been run.",
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
    .select("id")
    .eq("id", streamerId)
    .single();

  if (streamerError || !streamer) {
    return { error: "Choose a valid streamer." };
  }

  // A category's kind is immutable after creation (only name and
  // streamer can change here), so the sibling check below needs to
  // know it to compare against the right group. The unique index is
  // (streamer_id, platform, kind, lower(name)), so a rename that
  // collides with ANOTHER category in the exact same streamer +
  // platform + kind group would otherwise fail on the DB constraint
  // with a raw error — checked here first for a clean message,
  // excluding this category's own row.
  const { data: currentCategory } = await supabase
    .from("categories")
    .select("kind")
    .eq("id", categoryId)
    .single();

  if (!currentCategory) {
    return { error: "That category no longer exists." };
  }

  const { data: siblingCategories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("streamer_id", streamerId)
    .eq("platform", platform)
    .eq("kind", currentCategory.kind)
    .neq("id", categoryId);

  const conflict = siblingCategories?.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (conflict) {
    return {
      error: `A ${currentCategory.kind} category named "${trimmed}" already exists for this streamer.`,
    };
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
    if (error.code === "23505") {
      return {
        error: "That name conflicts with an existing category — try a different name.",
      };
    }
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
