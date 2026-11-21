import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ebayOrderShippingMinor,
  ebayOrderTaxMinor,
  normalizeEbayOrderHeader,
  normalizeEbayOrderLines,
} from './ebay-order-normalizer';

describe('eBay order provider-data normalization', () => {
  it('requires the provider total, currency and creation timestamp', () => {
    const result = normalizeEbayOrderHeader({
      creationDate: '2026-11-20T10:15:00.000Z',
      pricingSummary: { total: { value: '218.00', currency: 'GBP' } },
    });
    assert.deepEqual(result, {
      totalMinor: 21800,
      currency: 'GBP',
      createdAt: '2026-11-20T10:15:00.000Z',
      missingFields: [],
    });
    assert.deepEqual(normalizeEbayOrderHeader({ pricingSummary: {} }).missingFields, [
      'order total', 'order currency', 'provider creation date',
    ]);
  });

  it('uses lineItemCost as the whole line amount and derives per-unit price without multiplying twice', () => {
    const result = normalizeEbayOrderLines('ORDER-1', [{
      lineItemId: 'LINE-1',
      sku: 'SKU-1',
      title: 'Lamp',
      quantity: 4,
      lineItemCost: { value: '800.00', currency: 'GBP' },
    }], 'GBP', sku => sku === 'SKU-1' ? 'product-1' : null);
    assert.equal(result.exceptions.length, 0);
    assert.deepEqual(result.items[0], {
      product_id: 'product-1',
      sku: 'SKU-1',
      product_name: 'Lamp',
      quantity: 4,
      unit_price_minor: 20000,
      tax_amount_minor: 0,
      total_price_minor: 80000,
      raw_item: {
        lineItemId: 'LINE-1', legacyItemId: null, sku: 'SKU-1', title: 'Lamp',
        quantity: 4, lineItemCost: { value: '800.00', currency: 'GBP' },
        discountedLineItemCost: null, total: null, taxes: [], ebayCollectAndRemitTaxes: [],
      },
    });
  });

  it('uses the provider discounted line amount when present', () => {
    const result = normalizeEbayOrderLines('ORDER-2', [{
      lineItemId: 'LINE-2', sku: 'SKU-2', title: 'Chandelier', quantity: 1,
      lineItemCost: { value: '239.99', currency: 'GBP' },
      discountedLineItemCost: { value: '229.99', currency: 'GBP' },
    }], 'GBP', () => null);
    assert.equal(result.items[0].total_price_minor, 22999);
    assert.equal(result.items[0].unit_price_minor, 22999);
  });

  it('does not invent missing SKUs, titles, quantities, prices or currencies', () => {
    const result = normalizeEbayOrderLines('ORDER-3', [{
      lineItemId: 'LINE-3', title: 'Unknown SKU item', quantity: 1,
      lineItemCost: { value: '20.00', currency: 'GBP' },
    }, {
      lineItemId: 'LINE-4', sku: 'SKU-4', title: 'Missing price', quantity: 1,
    }, {
      lineItemId: 'LINE-5', sku: 'SKU-5', title: 'Wrong currency', quantity: 1,
      lineItemCost: { value: '20.00', currency: 'USD' },
    }], 'GBP', () => null);
    assert.equal(result.items.length, 0);
    assert.equal(result.exceptions.length, 3);
    assert.match(result.exceptions[0].details, /provider SKU/);
    assert.match(result.exceptions[1].details, /provider line item price/);
    assert.match(result.exceptions[2].details, /currency matching the order/);
    assert.equal(JSON.stringify(result).includes('UNKNOWN'), false);
  });

  it('removes provider tax reference identifiers from exception snippets', () => {
    const result = normalizeEbayOrderLines('ORDER-4', [{
      lineItemId: 'LINE-6', sku: 'SKU-6', title: 'Taxed item', quantity: 1,
      lineItemCost: { value: '20.00', currency: 'GBP' },
      ebayCollectAndRemitTaxes: [{
        taxType: 'VAT', amount: { value: '4.00', currency: 'GBP' },
        ebayReference: { name: 'VAT', value: 'GB123456789' },
      }],
    }], 'USD', () => null);
    assert.equal(result.items.length, 0);
    assert.equal(JSON.stringify(result.exceptions).includes('GB123456789'), false);
  });

  it('adds seller-collected and eBay-collected taxes when no order tax total is supplied', () => {
    const order = {
      lineItems: [{
        taxes: [{ amount: { value: '2.00', currency: 'GBP' } }],
        ebayCollectAndRemitTaxes: [{ amount: { value: '3.00', currency: 'GBP' } }],
      }],
    };
    assert.equal(ebayOrderTaxMinor(order), 500);
  });

  it('calculates provider tax and net shipping from the supplied breakdown', () => {
    const order = {
      pricingSummary: {
        tax: { value: '5.00', currency: 'GBP' },
        deliveryCost: { value: '72.00', currency: 'GBP' },
        deliveryDiscount: { value: '-51.00', currency: 'GBP' },
      },
      lineItems: [{
        taxes: [{ amount: { value: '2.00', currency: 'GBP' } }],
        ebayCollectAndRemitTaxes: [{ amount: { value: '3.00', currency: 'GBP' } }],
      }],
    };
    assert.equal(ebayOrderTaxMinor(order), 500);
    assert.equal(ebayOrderShippingMinor(order), 2100);
  });
});
