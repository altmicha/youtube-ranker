export const TIME_RANGES = ["daily", "weekly", "monthly", "all"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export const DEFAULT_TIME_RANGE: TimeRange = "weekly";

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  all: "All time",
};

// Human-readable window phrase for empty-state copy, e.g.
// "No videos submitted in Gaming in the last 24 hours."
export const TIME_RANGE_WINDOW_TEXT: Record<TimeRange, string> = {
  daily: "last 24 hours",
  weekly: "last 7 days",
  monthly: "last 30 days",
  all: "",
};

/** Parses a raw ?range= value, falling back to the default for
 * anything unrecognized (missing param, typo, stale link). */
export function parseTimeRange(raw: string | undefined): TimeRange {
  return (TIME_RANGES as readonly string[]).includes(raw ?? "")
    ? (raw as TimeRange)
    : DEFAULT_TIME_RANGE;
}

/** Returns the ISO cutoff timestamp for a range ("show submissions
 * since this instant"), or null for "all" (no cutoff). */
export function timeRangeSince(range: TimeRange): string | null {
  const days = { daily: 1, weekly: 7, monthly: 30, all: null }[range];
  if (days === null) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
