import Link from "next/link";
import { TIME_RANGES, TIME_RANGE_LABELS, type TimeRange } from "@/lib/time-range";
import type { CategoryKind } from "@/lib/types/database.types";
import { cn } from "@/lib/utils";

export function TimeRangeFilter({
  basePath,
  categorySlug,
  active,
  kind,
}: {
  // e.g. "/youtube" or "/twitch" — links become `${basePath}/${categorySlug}?range=...`.
  basePath: string;
  categorySlug: string;
  active: TimeRange;
  // Carried through so switching time ranges on a queue category's
  // page doesn't lose that context and silently land back on the
  // official category with the same slug (they can now both exist —
  // see add_category_kind.sql). Omitted for "official" (the default)
  // so official category URLs stay exactly as they always looked.
  kind: CategoryKind;
}) {
  const kindParam = kind === "queue" ? "&kind=queue" : "";

  return (
    <div className="flex flex-wrap gap-1.5">
      {TIME_RANGES.map((range) => (
        <Link
          key={range}
          href={`${basePath}/${categorySlug}?range=${range}${kindParam}`}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            range === active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {TIME_RANGE_LABELS[range]}
        </Link>
      ))}
    </div>
  );
}
