import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchEbaySellerIdentity } from './ebay-identity';

test('fetches the authenticated seller identity from the correct environment', async () => {
  let requestedUrl = '';
  let authorization = '';
  const identity = await fetchEbaySellerIdentity('SANDBOX', 'sandbox-user-token', async (input, init) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get('Authorization') || '';
    return Response.json({ userId: 'immutable-seller-id', username: 'seller-name' });
  });

  assert.equal(requestedUrl, 'https://apiz.sandbox.ebay.com/commerce/identity/v1/user/');
  assert.equal(authorization, 'Bearer sandbox-user-token');
  assert.deepEqual(identity, { userId: 'immutable-seller-id', username: 'seller-name' });
});

test('uses the production Identity API host', async () => {
  let requestedUrl = '';
  const identity = await fetchEbaySellerIdentity('PRODUCTION', 'production-user-token', async input => {
    requestedUrl = String(input);
    return Response.json({ userId: 'production-seller-id' });
  });

  assert.equal(requestedUrl, 'https://apiz.ebay.com/commerce/identity/v1/user/');
  assert.deepEqual(identity, { userId: 'production-seller-id', username: null });
});

test('fails closed when eBay does not return an immutable user ID', async () => {
  await assert.rejects(
    fetchEbaySellerIdentity('SANDBOX', 'token', async () => Response.json({ username: 'seller-name' })),
    /invalid seller identity/i,
  );
});

test('does not accept an unsuccessful Identity API response', async () => {
  await assert.rejects(
    fetchEbaySellerIdentity('SANDBOX', 'token', async () => new Response(null, { status: 401 })),
    /could not be verified/i,
  );
});

test('rejects missing access tokens before making a request', async () => {
  let called = false;
  await assert.rejects(
    fetchEbaySellerIdentity('SANDBOX', '', async () => {
      called = true;
      return Response.json({});
    }),
    /access token is required/i,
  );
  assert.equal(called, false);
});
