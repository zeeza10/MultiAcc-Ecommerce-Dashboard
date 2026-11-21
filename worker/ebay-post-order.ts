export type EbayPostOrderMarketplace = 'EBAY_UK' | 'EBAY_US' | 'EBAY_DE';

/** Post-Order API uses the legacy global IDs (EBAY_UK, not EBAY_GB). */
export function postOrderMarketplaceId(marketplace: string): EbayPostOrderMarketplace {
  if (marketplace === 'EBAY_UK' || marketplace === 'EBAY_US' || marketplace === 'EBAY_DE') {
    return marketplace;
  }
  throw new Error('The selected eBay marketplace is not supported by the Post-Order API.');
}

/** Post-Order OAuth user tokens must use the IAF authorization scheme. */
export function buildEbayPostOrderHeaders(accessToken: string, marketplace: string): Record<string, string> {
  if (!accessToken.trim()) throw new Error('An eBay user access token is required.');
  return {
    Authorization: `IAF ${accessToken}`,
    'X-EBAY-C-MARKETPLACE-ID': postOrderMarketplaceId(marketplace),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/** Subtract calendar months without Date overflow into the following month. */
export function subtractUtcMonthsClamped(date: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 0) throw new Error('A non-negative whole month count is required.');
  const targetMonthStart = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() - months,
    1,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
  const lastDay = new Date(Date.UTC(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return targetMonthStart;
}
