import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEbaySignatureComponents } from './ebay-finance-signature';

describe('eBay Finance RFC9421 request signatures', () => {
  it('builds the signed component list and signature base for GET with query parameters', () => {
    const result = buildEbaySignatureComponents(
      'GET',
      'https://api.ebay.com/sell/finances/v1/transaction?limit=100&offset=0',
      'public-key-jwe',
      1763731200,
    );
    assert.equal(result.signatureInput, 'sig1=("x-ebay-signature-key" "@method" "@path" "@authority");created=1763731200');
    assert.equal(result.signatureBase, [
      '"x-ebay-signature-key": public-key-jwe',
      '"@method": GET',
      '"@path": /sell/finances/v1/transaction?limit=100&offset=0',
      '"@authority": api.ebay.com',
      '"@signature-params": ("x-ebay-signature-key" "@method" "@path" "@authority");created=1763731200',
    ].join('\n'));
  });

  it('preserves the exact path and query in the signature base', () => {
    const result = buildEbaySignatureComponents('GET', 'https://api.ebay.com/sell/finances/v1/payout?limit=25', 'jwe', 1);
    assert.ok(result.signatureBase.includes('"@path": /sell/finances/v1/payout?limit=25'));
  });
});
