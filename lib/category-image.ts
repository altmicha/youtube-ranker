const BUCKET = "category-covers";

// Pure string construction (Supabase's own getPublicUrl() does the
// same thing under the hood, no network call) — written this way so
// it works identically in Server Components and Client Components
// without needing to instantiate a Supabase client just to build a
// URL. Returns null if there's no uploaded image (falls back to the
// gradient) or the Supabase URL env var isn't set.
export function categoryImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BUCKET}/${imagePath}`;
}
