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
      '"@path": /sell/finances/v1/transaction',
      '"@authority": apiz.ebay.com',
      '"@signature-params": ("x-ebay-signature-key" "@method" "@path" "@authority");created=1763731200',
    ].join('\n'));
  });

  it('excludes query parameters from the RFC 9421 @path component', () => {
    const result = buildEbaySignatureComponents('GET', 'https://apiz.ebay.com/sell/finances/v1/payout?limit=25&offset=0', 'jwe', 1);
    assert.ok(result.signatureBase.includes('"@path": /sell/finances/v1/payout'));
    assert.ok(!result.signatureBase.includes('"@path": /sell/finances/v1/payout?'));
    assert.ok(result.signatureInput.includes('"@path"'));
  });

  it('normalizes an empty URL path to a slash', () => {
    const result = buildEbaySignatureComponents('GET', 'https://apiz.ebay.com', 'jwe', 1);
    assert.ok(result.signatureBase.includes('"@path": /'));
  });
});

describe('eBay signing private-key parsing', () => {
  const apiPrivateKey = 'MC4CAQAwBQYDK2VwBCIEIK7aOaAmUXkpd03Tx/zHBvn12mM85C7SVkHLkaXcxwvf';

  it('decodes the base64 PKCS#8 DER format returned by eBay Key Management API', () => {
    const der = decodeEbayPrivateKeyPem(apiPrivateKey);
    assert.equal(der[0], 0x30);
    assert.equal(der.length, 48);
  });

  it('accepts the same PKCS#8 DER key wrapped in PEM headers', () => {
    const pem = `-----BEGIN PRIVATE KEY-----\n${apiPrivateKey}\n-----END PRIVATE KEY-----\n`;
    assert.deepEqual(decodeEbayPrivateKeyPem(pem), decodeEbayPrivateKeyPem(apiPrivateKey));
  });

  it('rejects malformed and non-PKCS#8 values', () => {
    assert.throws(() => decodeEbayPrivateKeyPem('not-a-key'));
    assert.throws(() => decodeEbayPrivateKeyPem('AQIDBA=='));
    assert.throws(() => decodeEbayPrivateKeyPem('-----BEGIN PRIVATE KEY-----\n***\n-----END PRIVATE KEY-----'));
  });
});
