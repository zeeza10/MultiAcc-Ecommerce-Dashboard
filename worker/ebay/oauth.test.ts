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

  it('binds platform credentials to the exact environment and field', async () => {
    const aad = 'platform:EBAY:SANDBOX:client-secret:v1';
    const ciphertext = await encryptToken('app-secret', testKey, aad);
    assert.equal(await decryptToken(ciphertext, testKey, aad), 'app-secret');
    await assert.rejects(() => decryptToken(ciphertext, testKey, 'platform:EBAY:PRODUCTION:client-secret:v1'));
    await assert.rejects(() => decryptToken(ciphertext, testKey, 'platform:EBAY:SANDBOX:client-id:v1'));
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

  it('fails closed unless encrypted platform credentials and server keys are available', async () => {
    assert.equal(await isEbayOAuthConfigured({}), false);
    // Legacy plaintext environment values must not activate OAuth.
    assert.equal(await isEbayOAuthConfigured({
      EBAY_SANDBOX_CLIENT_ID: 'legacy-id',
      EBAY_SANDBOX_CLIENT_SECRET: 'legacy-secret',
      EBAY_SANDBOX_RUNAME: 'legacy-runame',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      EBAY_TOKEN_ENCRYPTION_KEY: testKey,
    }, 'SANDBOX'), false);
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

describe('platform integration credential vault migration', () => {
  it('restricts vault tables and audit writes to the service role', () => {
    const migration = readFileSync(
      new URL('../../supabase/migrations/20261115110000_platform_integration_credentials.sql', import.meta.url),
      'utf8',
    );
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /FORCE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.platform_integration_credentials FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /GRANT SELECT ON TABLE public\.platform_integration_credentials TO service_role/);
    assert.match(migration, /save_platform_integration_credentials/);
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = ''/);
    assert.match(migration, /auth\.jwt\(\) ->> 'role'/);
    assert.match(migration, /INSERT INTO public\.platform_integration_audit/);
  });
});
