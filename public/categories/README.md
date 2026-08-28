# Category cover images

Drop cover images in this folder using these exact filenames (matching
each category's URL slug). The homepage category grid looks for these
automatically — no code change needed once a file is added.

- all.jpg
- gaming.jpg
- funny.jpg
- lsf.jpg
- cop-slop.jpg
- react.jpg
- irl.jpg
- slots.jpg
- sports.jpg
- horror.jpg
- variety.jpg
- music.jpg
- just-chatting.jpg

## Notes

- Any of the 13 files can be missing — a missing/failed image falls
  back to that category's colored gradient automatically
  (`components/category-grid.tsx`), so there's no broken-image state.
- Recommended aspect ratio: 3:4 (portrait), since cards render at a
  fixed 144×192px (`w-36 h-48`) with `object-cover` — a roughly
  square or landscape source image will get cropped on the sides/top,
  not stretched.
- `.jpg` specifically — the code requests `/categories/<slug>.jpg`.
  If you'd rather use `.png` or `.webp`, update the `src` template in
  `CategoryPoster` inside `components/category-grid.tsx` to match.
