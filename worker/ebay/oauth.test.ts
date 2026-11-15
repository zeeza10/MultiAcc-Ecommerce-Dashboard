import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decryptToken, encryptToken, isEbayOAuthConfigured } from './oauth';

const testKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

describe('eBay OAuth token protection', () => {
  it('encrypts and decrypts tokens using AES-256-GCM', async () => {
    const ciphertext = await encryptToken('seller-refresh-token', testKey);
    assert.match(ciphertext, /^v1\./);
    assert.notEqual(ciphertext, 'seller-refresh-token');
    assert.equal(await decryptToken(ciphertext, testKey), 'seller-refresh-token');
  });

  it('uses a fresh nonce for every encryption', async () => {
    const first = await encryptToken('same-token', testKey);
    const second = await encryptToken('same-token', testKey);
    assert.notEqual(first, second);
  });

  it('binds encrypted tokens to the intended marketplace account', async () => {
    const ciphertext = await encryptToken('account-token', testKey, 'org-a:account-a:access');
    assert.equal(await decryptToken(ciphertext, testKey, 'org-a:account-a:access'), 'account-token');
    await assert.rejects(() => decryptToken(ciphertext, testKey, 'org-b:account-b:access'));
  });

  it('rejects decryption with the wrong key', async () => {
    const ciphertext = await encryptToken('seller-access-token', testKey);
    const wrongKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(8)));
    await assert.rejects(() => decryptToken(ciphertext, wrongKey));
  });

  it('does not report OAuth ready without all server-side secrets', () => {
    assert.equal(isEbayOAuthConfigured({}), false);
    assert.equal(isEbayOAuthConfigured({
      EBAY_SANDBOX_CLIENT_ID: 'sandbox-id',
      EBAY_SANDBOX_CLIENT_SECRET: 'sandbox-secret',
      EBAY_SANDBOX_RUNAME: 'sandbox-runame',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      EBAY_TOKEN_ENCRYPTION_KEY: testKey,
    }, 'SANDBOX'), true);
  });
});

describe('eBay refresh concurrency safeguards', () => {
  it('uses a database row lease with SKIP LOCKED and a bounded expiry', () => {
    const migration = readFileSync(
      new URL('../../supabase/migrations/20261115043000_marketplace_token_refresh_lease.sql', import.meta.url),
      'utf8',
    );
    assert.match(migration, /FOR UPDATE OF c SKIP LOCKED/);
    assert.match(migration, /refresh_lease_until = now\(\) \+ interval '3 minutes'/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_marketplace_token_refreshes/);
  });

  it('uses compare-and-set lease ownership before saving refreshed credentials', () => {
    const source = readFileSync(new URL('./oauth.ts', import.meta.url), 'utf8');
    assert.match(source, /claim_marketplace_token_refreshes/);
    assert.match(source, /\.eq\('refresh_lease_token', leaseToken\)/);
    assert.match(source, /CREDENTIAL_REFRESH_LEASE_LOST/);
  });
});
