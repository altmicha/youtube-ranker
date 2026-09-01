// "My VODs" is a normal, manually-created official YouTube category —
// unlike Top daily clips / Featured clips, there's no ensure*()/
// refresh job here, it's just created through the regular /creator
// "add category" flow like any other official category. This file is
// only the detection helper, used for two things: the owner-aware
// submit permission check (app/actions/videos.ts) and finding it on
// /streamer/[slug] to show its teaser card.
export const MY_VODS_NAME = "My VODs";

export function isMyVodsCategory(category: { slug: string; name: string; platform?: string }): boolean {
  if (category.platform && category.platform !== "youtube") return false;
  return category.slug.startsWith("my-vods-") || category.name === MY_VODS_NAME;
}
