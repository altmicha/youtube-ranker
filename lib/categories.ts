// URL-safe slug generated from a category name at creation time —
// "Cop Slop" -> "cop-slop". Stored on the category row and never
// recomputed afterward, so renaming a category doesn't change its URL.
export function categorySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}
