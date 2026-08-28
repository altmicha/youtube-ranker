/**
 * Formats a count for compact display: 1500 -> "1.5K", 1200000 -> "1.2M".
 * One decimal place, but trailing ".0" is dropped (2000000 -> "2M",
 * not "2.0M"). Values under 1000 are shown as-is.
 */
export function formatCount(n: number): string {
  const units: [number, string][] = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ];

  for (const [threshold, suffix] of units) {
    if (n >= threshold) {
      const value = Math.round((n / threshold) * 10) / 10;
      const formatted = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
      return `${formatted}${suffix}`;
    }
  }

  return String(n);
}
