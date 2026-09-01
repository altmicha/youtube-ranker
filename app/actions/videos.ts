"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, canSubmitOnCategoryPage } from "@/lib/auth/roles";
import { extractYoutubeId, fetchYoutubeMetadata } from "@/lib/youtube";
import { extractTwitchClipSlug, fetchTwitchClipMetadata } from "@/lib/twitch";
import { extractTiktokVideoId, fetchTiktokMetadata } from "@/lib/tiktok";
import { isTopDailyClipsCategory } from "@/lib/top-daily-clips";
import { isMyVodsCategory } from "@/lib/my-vods";
import type { VideoSource, CategoryKind } from "@/lib/types/database.types";

export type SubmitVideoResult = { error: string } | { success: true };

export async function submitVideo(
  url: string,
  categorySlug: string,
  platform: VideoSource,
  kind: CategoryKind
): Promise<SubmitVideoResult> {
  // Feature: only logged-in users can submit. getCurrentProfile()
  // reads the session server-side, so this can't be bypassed from the
  // client no matter what the form sends.
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: "You need to sign in to submit a video." };
  }

  if (!categorySlug) {
    return { error: "Choose a category first." };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return {
      error:
        platform === "youtube"
          ? "Paste a YouTube URL first."
          : platform === "twitch"
            ? "Paste a Twitch clip URL first."
            : "Paste a TikTok video URL first.",
    };
  }

  // Detect YouTube vs Twitch vs TikTok from the URL, then check it
  // matches the page the form was submitted from — pasting the wrong
  // type of link on any page is a clear error rather than silently
  // accepting it or guessing which page they "meant".
  const youtubeId = extractYoutubeId(trimmed);
  const twitchSlug = youtubeId ? null : extractTwitchClipSlug(trimmed);
  const tiktokId = youtubeId || twitchSlug ? null : extractTiktokVideoId(trimmed);

  if (!youtubeId && !twitchSlug && !tiktokId) {
    return {
      error:
        platform === "youtube"
          ? "That doesn't look like a valid YouTube video URL."
          : platform === "twitch"
            ? "That doesn't look like a valid Twitch clip URL."
            : "That doesn't look like a valid TikTok video URL.",
    };
  }
  if (platform === "youtube" && !youtubeId) {
    return { error: "That's not a YouTube URL — submit it on the matching platform's page instead." };
  }
  if (platform === "twitch" && !twitchSlug) {
    return { error: "That's not a Twitch clip URL — submit it on the matching platform's page instead." };
  }
  if (platform === "tiktok" && !tiktokId) {
    return { error: "That's not a TikTok video URL — submit it on the matching platform's page instead." };
  }

  const supabase = await createClient();

  // Categories are creator-managed rows, looked up by (platform, slug,
  // kind). (platform, slug) alone is no longer unique — an official
  // and a queue category can now share the same slug for the same
  // streamer+platform (see add_category_kind.sql's new unique
  // indexes) — so kind is required here to resolve the exact category
  // this submission is for, not its same-slug sibling.
  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("slug, name, platform, kind, streamer_id")
    .eq("platform", platform)
    .eq("slug", categorySlug)
    .eq("kind", kind)
    .single();

  if (categoryError) {
    console.error("submitVideo: category lookup failed", {
      platform,
      categorySlug,
      kind,
      code: categoryError.code,
      message: categoryError.message,
    });
    return { error: `Could not look up that category: ${categoryError.message}` };
  }
  if (!category) {
    return { error: "Choose a valid category for this page." };
  }

  // Requirement: no user submission at all on the auto-populated Top
  // daily clips category — enforced here server-side, not just by
  // hiding the form (see app/twitch/[slug]/page.tsx), so a hand-built
  // request can't bypass it either.
  if (isTopDailyClipsCategory(category)) {
    return { error: "This category is updated automatically and doesn't accept submissions." };
  }

  // Requirement: official categories are normally creator/streamer/
  // admin-only to submit to (canSubmitOnCategoryPage) — but "My VODs"
  // is stricter: only that specific streamer's owner, a creator, or
  // an admin, not any account with the generic "streamer" role. Both
  // rules are enforced here server-side, not just by hiding the form
  // on the category page, so a hand-built request can't bypass either.
  if (category.kind === "official") {
    if (isMyVodsCategory(category)) {
      const authorized = await isMyVodsAuthorized(supabase, category.streamer_id, profile);
      if (!authorized) {
        return { error: "Only this streamer's owner, a creator, or an admin can submit to My VODs." };
      }
    } else if (!canSubmitOnCategoryPage(profile.role)) {
      return { error: "Only creators, streamers, or admins can submit to this category." };
    }
  }

  // Rate limit: normal users can submit at most 3 videos per hour,
  // per category — filtered by the same (source, category slug) pair
  // used everywhere else, so 3 YouTube "lsf" + 3 Twitch "lsf" in the
  // same hour is fine (different source values). Creators are exempt.
  if (profile.role !== "creator") {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("submissions")
      .select("id, videos!inner(category, source)", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("videos.category", categorySlug)
      .eq("videos.source", platform)
      .gte("created_at", oneHourAgo);

    if (countError) {
      console.error("submitVideo: rate-limit count query failed", {
        categorySlug,
        code: countError.code,
        message: countError.message,
      });
      return { error: `Could not check the submission limit: ${countError.message}` };
    }
    if ((count ?? 0) >= 3) {
      return { error: "You can only submit 3 videos per hour in this category." };
    }
  }

  if (youtubeId) {
    return submitYoutubeVideo(supabase, youtubeId, categorySlug);
  }
  if (twitchSlug) {
    return submitTwitchClip(supabase, twitchSlug, categorySlug);
  }
  return submitTiktokVideo(supabase, tiktokId!, trimmed, categorySlug);
}

// Awaited return type of createClient() — kept local rather than
// exported, just to type the two helpers below without repeating the
// whole createClient() call signature.
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Requirement: "My VODs" submit access is creator/admin, or
// specifically the owning streamer's owner (streamers.owner_id) — not
// any account with role "streamer" the way other official categories
// work. A category with no streamer_id at all has no owner to check
// against, so only creator/admin can submit to it.
async function isMyVodsAuthorized(
  supabase: SupabaseServerClient,
  streamerId: string | null,
  profile: { id: string; role: string }
): Promise<boolean> {
  if (profile.role === "creator" || profile.role === "admin") return true;
  if (!streamerId) return false;

  const { data: streamer, error } = await supabase
    .from("streamers")
    .select("owner_id")
    .eq("id", streamerId)
    .single();

  if (error) {
    console.error("isMyVodsAuthorized: streamer lookup failed", {
      streamerId,
      code: error.code,
      message: error.message,
    });
    return false;
  }

  return !!streamer && streamer.owner_id === profile.id;
}

async function submitYoutubeVideo(
  supabase: SupabaseServerClient,
  videoId: string,
  categorySlug: string
): Promise<SubmitVideoResult> {
  // Fetch title/thumbnail/channel/stats from the YouTube Data API v3.
  // fetchYoutubeMetadata() never throws — it returns null on any
  // failure (missing key, network error, private/deleted video) — so
  // a metadata/stats failure never blocks the submission itself; we
  // just fall through with nulls.
  const metadata = await fetchYoutubeMetadata(videoId);

  // submit_video() atomically creates-or-updates the video row and
  // inserts a submissions row for the current user. Requirement 1:
  // category is saved as the plain slug (e.g. "music"), the same
  // value /youtube/[slug] filters by — see schema.sql.
  const { error } = await supabase.rpc("submit_video", {
    p_youtube_id: videoId,
    p_title: metadata?.title ?? null,
    p_thumbnail_url: metadata?.thumbnailUrl ?? null,
    p_channel_name: metadata?.channelName ?? null,
    p_category: categorySlug,
    p_view_count: metadata?.viewCount ?? null,
    p_like_count: metadata?.likeCount ?? null,
    p_dislike_count: metadata?.dislikeCount ?? null,
    p_published_at: metadata?.publishedAt ?? null,
  });

  if (error) {
    console.error("submitYoutubeVideo: submit_video RPC failed", {
      videoId,
      categorySlug,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (error.code === "23505") {
      return { error: "You've already submitted this video." };
    }
    return { error: `Could not save video: ${error.message}` };
  }

  revalidatePath("/youtube");
  // Requirement: after a successful submit, the new item should show
  // in the list on the category page itself — /youtube only covered
  // the platform landing page before. The 'page' type invalidates
  // every /youtube/<slug> route, whichever category this was.
  revalidatePath("/youtube/[slug]", "page");
  revalidatePath("/creator");
  return { success: true };
}

async function submitTwitchClip(
  supabase: SupabaseServerClient,
  slug: string,
  categorySlug: string
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
    p_category: categorySlug,
    p_view_count: metadata?.viewCount ?? null,
    p_published_at: metadata?.createdAt ?? null,
  });

  if (error) {
    console.error("submitTwitchClip: submit_twitch_clip RPC failed", {
      slug,
      categorySlug,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (error.code === "23505") {
      return { error: "You've already submitted this clip." };
    }
    return { error: `Could not save clip: ${error.message}` };
  }

  revalidatePath("/twitch");
  revalidatePath("/twitch/[slug]", "page");
  revalidatePath("/creator");
  return { success: true };
}

async function submitTiktokVideo(
  supabase: SupabaseServerClient,
  videoId: string,
  originalUrl: string,
  categorySlug: string
): Promise<SubmitVideoResult> {
  // Fetch title/thumbnail/author from TikTok's oEmbed endpoint. Same
  // fail-open contract as the other two: never throws, returns null
  // on any failure, so a metadata failure never blocks the submission
  // itself. Note there's no view count here at all — TikTok's oEmbed
  // response doesn't include one, unlike YouTube/Twitch.
  const metadata = await fetchTiktokMetadata(originalUrl);

  const { error } = await supabase.rpc("submit_tiktok_video", {
    p_video_id: videoId,
    p_title: metadata?.title ?? null,
    p_thumbnail_url: metadata?.thumbnailUrl ?? null,
    p_author_name: metadata?.authorName ?? null,
    p_category: categorySlug,
    p_published_at: null,
  });

  if (error) {
    console.error("submitTiktokVideo: submit_tiktok_video RPC failed", {
      videoId,
      categorySlug,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (error.code === "23505") {
      return { error: "You've already submitted this video." };
    }
    return { error: `Could not save video: ${error.message}` };
  }

  revalidatePath("/tiktok");
  revalidatePath("/tiktok/[slug]", "page");
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

  // Removed videos are filtered out of the platform pages, category
  // pages, and creator dashboard (is_removed = false), so revalidating
  // those paths makes them disappear immediately.
  revalidatePath("/youtube");
  revalidatePath("/youtube/[slug]", "page");
  revalidatePath("/twitch");
  revalidatePath("/twitch/[slug]", "page");
  revalidatePath("/tiktok");
  revalidatePath("/tiktok/[slug]", "page");
  revalidatePath("/creator");
  return { success: true };
}
