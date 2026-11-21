import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ebayAnalyticsMarketplaceId, ebaySellerStandardsProgram } from './ebay-analytics';

describe('eBay Analytics marketplace identifiers', () => {
  it('maps the internal UK marketplace to EBAY_GB for Analytics metrics', () => {
    assert.equal(ebayAnalyticsMarketplaceId('EBAY_UK'), 'EBAY_GB');
  });

  it('uses the documented PROGRAM_UK Seller Standards identifier', () => {
    assert.equal(ebaySellerStandardsProgram('EBAY_UK'), 'PROGRAM_UK');
  });

  it('maps US and Germany without changing their marketplace identifiers', () => {
    assert.equal(ebayAnalyticsMarketplaceId('EBAY_US'), 'EBAY_US');
    assert.equal(ebayAnalyticsMarketplaceId('EBAY_DE'), 'EBAY_DE');
    assert.equal(ebaySellerStandardsProgram('EBAY_US'), 'PROGRAM_US');
    assert.equal(ebaySellerStandardsProgram('EBAY_DE'), 'PROGRAM_DE');
  });

  it('fails closed for unsupported marketplaces', () => {
    assert.throws(() => ebayAnalyticsMarketplaceId('EBAY_AU'));
    assert.throws(() => ebaySellerStandardsProgram('EBAY_AU'));
  });
});
