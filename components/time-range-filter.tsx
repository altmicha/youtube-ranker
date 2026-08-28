import Link from "next/link";
import { TIME_RANGES, TIME_RANGE_LABELS, type TimeRange } from "@/lib/time-range";
import { cn } from "@/lib/utils";

export function TimeRangeFilter({
  categorySlug,
  active,
}: {
  categorySlug: string;
  active: TimeRange;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TIME_RANGES.map((range) => (
        <Link
          key={range}
          href={`/category/${categorySlug}?range=${range}`}
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
