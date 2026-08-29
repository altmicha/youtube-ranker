import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PAGE_SIZE = 30;

// Simple query-param-driven pagination (?take=60, ?take=90, ...),
// same pattern as the existing TimeRangeFilter's ?range= — no client
// JS state, just a link to a page that fetches a larger `take`.
// Requirement 4: 30 per load, with a Load more button.
export function LoadMoreLink({
  href,
  hasMore,
}: {
  href: string;
  hasMore: boolean;
}) {
  if (!hasMore) return null;

  return (
    <Link href={href} className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}>
      Load more
    </Link>
  );
}
