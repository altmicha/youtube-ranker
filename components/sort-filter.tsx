import Link from "next/link";
import type { TimeRange } from "@/lib/time-range";
import type { CategoryKind } from "@/lib/types/database.types";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "views_desc", label: "Most views" },
  { value: "views_asc", label: "Fewest views" },
  { value: "date_desc", label: "Newest" },
  { value: "date_asc", label: "Oldest" },
  { value: "votes_desc", label: "Most votes" },
  { value: "votes_asc", label: "Fewest votes" },
];

const LIKE_RATIO_OPTION = { value: "like_ratio_desc", label: "Highest like/view ratio" };

// Same plain-Link pill pattern as TimeRangeFilter — no client JS
// state, just links to a page that fetches with a different ?sort=.
// No "reset to default" pill: the default (submissions, most-first)
// is what you get with no ?sort= at all, same as before this feature
// existed for both official and queue categories.
export function SortFilter({
  basePath,
  categorySlug,
  range,
  kind,
  // Raw ?sort= value if one is active (e.g. "views_desc"), or
  // undefined for the default (submissions descending).
  active,
  // YouTube-category-page-only extra sort option — this component is
  // shared with /twitch/[slug], which never passes this, so Twitch
  // pages never render or link to like_ratio_desc at all.
  showLikeRatio = false,
  // Optional allow-list of sort values to show (e.g. only
  // ["views_desc", "votes_desc"] on Top daily clips pages). Undefined
  // (the default) shows every option, unchanged for every other
  // official/queue category on either platform.
  restrictTo,
}: {
  basePath: string;
  categorySlug: string;
  range: TimeRange;
  kind: CategoryKind;
  active?: string;
  showLikeRatio?: boolean;
  restrictTo?: string[];
}) {
  const kindParam = kind === "queue" ? "&kind=queue" : "";
  let options = showLikeRatio ? [...SORT_OPTIONS, LIKE_RATIO_OPTION] : SORT_OPTIONS;
  if (restrictTo) {
    options = options.filter((opt) => restrictTo.includes(opt.value));
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <Link
          key={opt.value}
          href={`${basePath}/${categorySlug}?range=${range}&sort=${opt.value}${kindParam}`}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            opt.value === active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}
