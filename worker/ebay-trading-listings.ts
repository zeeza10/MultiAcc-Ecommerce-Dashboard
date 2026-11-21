export type EbayMarketplaceCode = 'EBAY_UK' | 'EBAY_US' | 'EBAY_DE';
export type EbayProviderAccount = {
  id: string;
  organization_id: string;
  marketplace: EbayMarketplaceCode;
  environment: string;
  is_demo: boolean;
  auth_status: string;
};

export function ebaySiteMarketplaceId(marketplace: EbayMarketplaceCode): string {
  switch (marketplace) {
    case 'EBAY_UK': return 'EBAY_GB';
    case 'EBAY_US': return 'EBAY_US';
    case 'EBAY_DE': return 'EBAY_DE';
  }
}

export function parseTradingActiveListings(xml: string): {
  ack: string | null;
  totalPages: number;
  totalEntries: number;
  listings: Array<Record<string, unknown>>;
} {
  const decode = (value: string) => value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));

  const tag = (source: string, name: string): string | null => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp('<' + escaped + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + escaped + '>', 'i'));
    return match ? decode(match[1].replace(/<[^>]+>/g, '').trim()) : null;
  };
  const nested = (source: string, parent: string, child: string): string | null => {
    const block = source.match(new RegExp('<' + parent + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + parent + '>', 'i'));
    return block ? tag(block[1], child) : null;
  };
  const ack = tag(xml, 'Ack');
  const pagination = xml.match(/<PaginationResult(?:\\s[^>]*)?>([\\s\\S]*?)<\\/PaginationResult>/i)?.[1] || '';
  const totalPages = Number(tag(pagination, 'TotalNumberOfPages') || 0);
  const totalEntries = Number(tag(pagination, 'TotalNumberOfEntries') || 0);
  const items = [...xml.matchAll(/<Item(?:\\s[^>]*)?>([\\s\\S]*?)<\\/Item>/gi)].map(match => match[1]);
  const listings = items.map(item => {
    const priceBlock = item.match(/<CurrentPrice([^>]*)>([\\s\\S]*?)<\\/CurrentPrice>/i);
    const currency = priceBlock?.[1].match(/currencyID=["']([^"']+)["']/i)?.[1] || null;
    const currentPrice = priceBlock ? decode(priceBlock[2].trim()) : null;
    return {
      itemId: tag(item, 'ItemID'),
      sku: tag(item, 'SKU'),
      title: tag(item, 'Title'),
      quantity: tag(item, 'Quantity') === null ? null : Number(tag(item, 'Quantity')),
      quantitySold: tag(item, 'QuantitySold') === null ? null : Number(tag(item, 'QuantitySold')),
      listingType: tag(item, 'ListingType'),
      listingStatus: nested(item, 'SellingStatus', 'ListingStatus'),
      currentPrice,
      currency,
      startTime: tag(item, 'StartTime'),
      endTime: tag(item, 'EndTime'),
      viewItemUrl: tag(item, 'ViewItemURL'),
      galleryUrl: nested(item, 'PictureDetails', 'GalleryURL'),
    };
  }).filter(row => typeof row.itemId === 'string' && row.itemId.length > 0);
  return {
    ack,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 0,
    totalEntries: Number.isFinite(totalEntries) && totalEntries > 0 ? totalEntries : 0,
    listings,
  };
}
