import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ebayTradingSiteId, parseTradingActiveListings } from './ebay-trading-listings';

describe('eBay Trading active listing parser', () => {
  it('maps the product marketplace code to the Trading API site marketplace', () => {
    assert.equal(ebayTradingSiteId('EBAY_UK'), '3');
    assert.equal(ebayTradingSiteId('EBAY_US'), '0');
    assert.equal(ebayTradingSiteId('EBAY_DE'), '77');
  });

  it('extracts provider listing values without inventing missing fields', () => {
    const xml = `<?xml version="1.0"?>
      <GetMyeBaySellingResponse>
        <Ack>Success</Ack>
        <ActiveList>
          <PaginationResult><TotalNumberOfPages>1</TotalNumberOfPages><TotalNumberOfEntries>1</TotalNumberOfEntries></PaginationResult>
          <ItemArray><Item>
            <ItemID>123456789</ItemID><SKU>SKU-1</SKU><Title>Tom &amp; Jerry</Title>
            <Quantity>8</Quantity><QuantitySold>3</QuantitySold><ListingType>FixedPriceItem</ListingType>
            <SellingStatus><ListingStatus>Active</ListingStatus><CurrentPrice currencyID="GBP">12.50</CurrentPrice></SellingStatus>
            <StartTime>2026-11-20T10:00:00.000Z</StartTime><EndTime>2026-12-20T10:00:00.000Z</EndTime>
            <PictureDetails><GalleryURL>https://img.example/item.jpg</GalleryURL></PictureDetails>
          </Item></ItemArray>
        </ActiveList>
      </GetMyeBaySellingResponse>`;
    const result = parseTradingActiveListings(xml);
    assert.equal(result.ack, 'Success');
    assert.equal(result.totalPages, 1);
    assert.equal(result.totalEntries, 1);
    assert.deepEqual(result.listings[0], {
      itemId: '123456789', sku: 'SKU-1', title: 'Tom & Jerry', quantity: 8, quantitySold: 3,
      listingType: 'FixedPriceItem', listingStatus: 'Active', currentPrice: '12.50', currency: 'GBP',
      startTime: '2026-11-20T10:00:00.000Z', endTime: '2026-12-20T10:00:00.000Z',
      viewItemUrl: null, galleryUrl: 'https://img.example/item.jpg',
    });
  });

  it('does not invent item IDs, prices, currencies or quantities', () => {
    const result = parseTradingActiveListings('<GetMyeBaySellingResponse><Ack>Success</Ack><Item><Title>Listing</Title></Item></GetMyeBaySellingResponse>');
    assert.equal(result.listings.length, 0);
  });
});
