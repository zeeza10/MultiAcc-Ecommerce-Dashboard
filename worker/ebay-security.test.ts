import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decryptEbayValue, encryptEbayValue, hashEbayState, verifyEbayApplicationCredentials, EbayCredentialVerificationError } from './ebay-security';

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

describe('eBay application credential verification', () => {
  it('uses the selected environment OAuth endpoint and client credentials grant', async () => {
    let calledUrl = '';
    let calledInit: RequestInit | undefined;
    await verifyEbayApplicationCredentials('SANDBOX', 'sandbox-id', 'sandbox-secret', async (input, init) => {
      calledUrl = String(input);
      calledInit = init;
      return Response.json({ access_token: 'ephemeral-token', expires_in: 7200, token_type: 'Application Access Token' });
    });
    assert.equal(calledUrl, 'https://api.sandbox.ebay.com/identity/v1/oauth2/token');
    assert.equal(calledInit?.method, 'POST');
    assert.match(String((calledInit?.headers as Record<string, string>).Authorization), /^Basic /);
    assert.equal(String(calledInit?.body), 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope');
  });

  it('uses the Production OAuth endpoint for Production credentials', async () => {
    let calledUrl = '';
    await verifyEbayApplicationCredentials('PRODUCTION', 'production-id', 'production-secret', async (input) => {
      calledUrl = String(input);
      return Response.json({ access_token: 'ephemeral-token', expires_in: 7200 });
    });
    assert.equal(calledUrl, 'https://api.ebay.com/identity/v1/oauth2/token');
  });

  it('rejects credentials when eBay returns an authentication error', async () => {
    await assert.rejects(
      () => verifyEbayApplicationCredentials('SANDBOX', 'bad-id', 'bad-secret', async () => new Response('ignored', { status: 401 })),
      (error: unknown) => error instanceof EbayCredentialVerificationError && error.code === 'EBAY_CREDENTIALS_REJECTED' && error.httpStatus === 422,
    );
  });

  it('fails closed when eBay is unavailable or returns an invalid token payload', async () => {
    await assert.rejects(
      () => verifyEbayApplicationCredentials('SANDBOX', 'id', 'secret', async () => { throw new Error('network details must not escape'); }),
      (error: unknown) => error instanceof EbayCredentialVerificationError && error.code === 'EBAY_VERIFICATION_UNAVAILABLE',
    );
    await assert.rejects(
      () => verifyEbayApplicationCredentials('SANDBOX', 'id', 'secret', async () => Response.json({ access_token: '', expires_in: 0 })),
      (error: unknown) => error instanceof EbayCredentialVerificationError && error.code === 'EBAY_INVALID_TOKEN_RESPONSE',
    );
  });
});
