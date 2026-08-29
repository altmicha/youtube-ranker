/**
 * Formats a past date/ISO string as relative time: "3 days ago",
 * "2 years ago", "just now" for anything under 10 seconds.
 */
export function formatRelativeTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 10) return "just now";

  const divisions: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let duration = seconds;
  for (const [amount, unit] of divisions) {
    if (duration < amount) {
      return `${duration} ${unit}${duration === 1 ? "" : "s"} ago`;
    }
    duration = Math.floor(duration / amount);
  }

  return "";
}
