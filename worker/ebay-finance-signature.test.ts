import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEbaySignatureComponents, decodeEbayPrivateKeyPem } from './ebay-finance-signature';

describe('eBay Finance RFC9421 request signatures', () => {
  it('builds the signed component list and signature base for GET with query parameters', () => {
    const result = buildEbaySignatureComponents(
      'GET',
      'https://apiz.ebay.com/sell/finances/v1/transaction?limit=100&offset=0',
      'public-key-jwe',
      1763731200,
    );
    assert.equal(result.signatureInput, 'sig1=("x-ebay-signature-key" "@method" "@path" "@authority");created=1763731200');
    assert.equal(result.signatureBase, [
      '"x-ebay-signature-key": public-key-jwe',
      '"@method": GET',
      '"@path": /sell/finances/v1/transaction?limit=100&offset=0',
      '"@authority": apiz.ebay.com',
      '"@signature-params": ("x-ebay-signature-key" "@method" "@path" "@authority");created=1763731200',
    ].join('\n'));
  });

  it('preserves the exact path and query in the signature base', () => {
    const result = buildEbaySignatureComponents('GET', 'https://apiz.ebay.com/sell/finances/v1/payout?limit=25', 'jwe', 1);
    assert.ok(result.signatureBase.includes('"@path": /sell/finances/v1/payout?limit=25'));
  });
});

describe('eBay signing private-key PEM parsing', () => {
  it('decodes the PKCS#8 PEM body without storing or exposing key material', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nAQIDBA==\n-----END PRIVATE KEY-----';
    assert.deepEqual([...decodeEbayPrivateKeyPem(pem)], [1, 2, 3, 4]);
  });

  it('rejects malformed or non-PEM private key values', () => {
    assert.throws(() => decodeEbayPrivateKeyPem('not-a-pem'));
    assert.throws(() => decodeEbayPrivateKeyPem('-----BEGIN PRIVATE KEY-----\n***\n-----END PRIVATE KEY-----'));
  });
});
