import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decryptEbayValue, encryptEbayValue, hashEbayState } from './ebay-security';

const testKey = btoa('0123456789abcdef0123456789abcdef');

describe('eBay credential encryption', () => {
  it('encrypts values with randomized AES-GCM ciphertext and decrypts them', async () => {
    const env = { EBAY_TOKEN_ENCRYPTION_KEY: testKey } as any;
    const first = await encryptEbayValue('sandbox-client-secret', env);
    const second = await encryptEbayValue('sandbox-client-secret', env);
    assert.notEqual(first, second);
    assert.equal(await decryptEbayValue(first, env), 'sandbox-client-secret');
    assert.equal(await decryptEbayValue(second, env), 'sandbox-client-secret');
  });

  it('rejects missing or incorrectly sized encryption keys', async () => {
    await assert.rejects(() => encryptEbayValue('secret', {} as any), /not configured/);
    await assert.rejects(() => encryptEbayValue('secret', { EBAY_TOKEN_ENCRYPTION_KEY: btoa('short') } as any), /32-byte key/);
  });

  it('hashes OAuth state as stable SHA-256 hex without returning the original value', async () => {
    const first = await hashEbayState('random-state-value');
    const second = await hashEbayState('random-state-value');
    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.notEqual(first, 'random-state-value');
  });
});
