export type EbayAnalyticsMarketplace = 'EBAY_UK' | 'EBAY_US' | 'EBAY_DE';

export function ebayAnalyticsMarketplaceId(marketplace: string): string {
  switch (marketplace as EbayAnalyticsMarketplace) {
    case 'EBAY_UK': return 'EBAY_GB';
    case 'EBAY_US': return 'EBAY_US';
    case 'EBAY_DE': return 'EBAY_DE';
    default: throw new Error('The selected eBay marketplace is not supported by Analytics API.');
  }
}

/** Seller Standards uses PROGRAM_UK, while other APIs use the EBAY_GB marketplace ID. */
export function ebaySellerStandardsProgram(marketplace: string): string {
  switch (marketplace as EbayAnalyticsMarketplace) {
    case 'EBAY_UK': return 'PROGRAM_UK';
    case 'EBAY_US': return 'PROGRAM_US';
    case 'EBAY_DE': return 'PROGRAM_DE';
    default: throw new Error('The selected eBay marketplace is not supported by Seller Standards.');
  }
}
