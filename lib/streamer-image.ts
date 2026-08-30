const BUCKET = "streamer-covers";

// Mirrors lib/category-image.ts, pointed at the separate
// "streamer-covers" bucket so the existing category image upload
// flow/bucket is completely untouched.
export function streamerCoverUrl(coverPath: string | null): string | null {
  if (!coverPath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BUCKET}/${coverPath}`;
}
