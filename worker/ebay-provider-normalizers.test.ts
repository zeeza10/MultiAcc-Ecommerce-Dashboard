import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEbayAnalyticsResource, normalizeEbayFinanceSummary, normalizeEbaySellerAccountResource } from './ebay-provider-normalizers';

describe('eBay provider snapshot normalization', () => {
  it('keeps seller policy display fields and excludes unrelated personal fields', () => {
    const result = normalizeEbaySellerAccountResource('SELLER_RETURN_POLICY', {
      returnPolicies: [{ returnPolicyId: 'rp-1', name: '30 Day Returns', marketplaceId: 'EBAY_GB', returnsAccepted: true, returnPeriod: { value: 30, unit: 'DAY' }, refundMethod: 'MONEY_BACK', buyerEmail: 'private@example.test', returnAddress: { addressLine1: 'Private address' } }],
      accountOwner: { email: 'private@example.test' },
    }, 'EBAY_GB');
    assert.deepEqual(result.policies, [{
      policyId: 'rp-1', name: '30 Day Returns', marketplaceId: 'EBAY_GB',
      returnsAccepted: true, returnPeriod: { value: 30, unit: 'DAY' },
      refundMethod: 'MONEY_BACK', returnShippingCostPayer: null,
    }]);
    assert.equal(JSON.stringify(result).includes('private@example.test'), false);
  });

  it('keeps analytics records while excluding unrelated provider fields', () => {
    const result = normalizeEbayAnalyticsResource('ANALYTICS_TRAFFIC', {
      dimensionKeys: ['2026-11-20'], metrics: ['LISTING_VIEWS_TOTAL'],
      records: [{ dimensionValues: ['2026-11-20'], metricValues: [12], internalDebug: 'do-not-expose' }],
      sellerEmail: 'private@example.test',
    }, 'EBAY_GB');
    assert.deepEqual(result.records, [{ dimensionValues: ['2026-11-20'], metricValues: [12] }]);
    assert.equal(JSON.stringify(result).includes('private@example.test'), false);
    assert.equal(JSON.stringify(result).includes('do-not-expose'), false);
  });

  it('normalizes the documented eBay Analytics traffic report header and daily metric rows', () => {
    const result = normalizeEbayAnalyticsResource('ANALYTICS_TRAFFIC', {
      reportType: 'TRAFFIC',
      header: {
        dimensionKeys: [{ key: 'DAY', localizedName: 'day', dataType: 'DATE' }],
        metrics: [{ key: 'TOTAL_IMPRESSION_TOTAL', localizedName: 'Total impressions', dataType: 'NUMBER' }],
      },
      records: [{
        dimensionValues: [{ value: '2026-11-20', applicable: true }],
        metricValues: [{ value: 150, applicable: true }],
      }],
      startDate: '2026-11-01T00:00:00.000Z',
      endDate: '2026-11-20T23:59:59.000Z',
      lastUpdatedDate: '2026-11-21T00:00:00.000Z',
      sellerEmail: 'private@example.test',
    }, 'EBAY_GB');
    assert.deepEqual(result.dimensionKeys, [{ key: 'DAY', localizedName: 'day', dataType: 'DATE' }]);
    assert.deepEqual(result.metrics, [{ key: 'TOTAL_IMPRESSION_TOTAL', localizedName: 'Total impressions', dataType: 'NUMBER' }]);
    assert.deepEqual(result.records, [{
      dimensionValues: [{ value: '2026-11-20', applicable: true }],
      metricValues: [{ value: 150, applicable: true }],
    }]);
    assert.equal(result.reportType, 'TRAFFIC');
    assert.equal(JSON.stringify(result).includes('private@example.test'), false);
  });

  it('keeps finance amounts and counts while excluding bank and buyer details', () => {
    const result = normalizeEbayFinanceSummary('SELLER_FUNDS_CURRENT', {
      availableFunds: { value: 12.34, currency: 'GBP', bankAccountNumber: '12345678' },
      totalFunds: { value: 20, currency: 'GBP' },
      payoutInstrument: { accountLastFour: '9876' },
      buyer: { email: 'private@example.test' },
    }, 'EBAY_GB');
    assert.deepEqual(result.summary, {
      availableFunds: { value: 12.34, currency: 'GBP' },
      totalFunds: { value: 20, currency: 'GBP' },
    });
    assert.equal(JSON.stringify(result).includes('9876'), false);
    assert.equal(JSON.stringify(result).includes('private@example.test'), false);
  });
});
