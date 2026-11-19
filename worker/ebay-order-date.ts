/**
 * eBay Sell Fulfillment order search only accepts start dates within the
 * previous two years. Keep a one-day safety margin for clock skew and
 * provider-side boundary evaluation.
 */
export function normalizeEbayOrderStartDate(value: unknown, now = new Date()): {
  since: string;
  clamped: boolean;
} {
  const latest = now.getTime();
  const earliestDate = new Date(latest);
  earliestDate.setUTCFullYear(earliestDate.getUTCFullYear() - 2);
  earliestDate.setUTCDate(earliestDate.getUTCDate() + 1);
  const earliest = earliestDate.getTime();

  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < earliest || parsed > latest) {
    return { since: new Date(earliest).toISOString(), clamped: true };
  }
  return { since: new Date(parsed).toISOString(), clamped: false };
}
