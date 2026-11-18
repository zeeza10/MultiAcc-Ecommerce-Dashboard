import test from 'node:test';
import assert from 'node:assert/strict';
import { handleEbayAccountDeletionNotification, EBAY_ACCOUNT_DELETION_ENDPOINT } from './ebay-account-deletion';

test('eBay account deletion challenge returns SHA-256 of challenge + token + endpoint', async () => {
  const token = 'test_verification_token_0123456789ABCDEF';
  const challenge = 'unique-ebay-challenge';
  const response = await handleEbayAccountDeletionNotification(
    new Request(EBAY_ACCOUNT_DELETION_ENDPOINT + '?challenge_code=' + challenge),
    { EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN: token },
  );
  assert.ok(response);
  assert.equal(response.status, 200);
  const body = await response.json() as { challengeResponse: string };
  const expected = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(challenge + token + EBAY_ACCOUNT_DELETION_ENDPOINT),
  );
  const expectedHex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, '0')).join('');
  assert.equal(body.challengeResponse, expectedHex);
});

test('eBay account deletion challenge fails closed without a valid token', async () => {
  const response = await handleEbayAccountDeletionNotification(
    new Request(EBAY_ACCOUNT_DELETION_ENDPOINT + '?challenge_code=abc'),
    {},
  );
  assert.ok(response);
  assert.equal(response.status, 503);
});

test('unrelated paths are not handled', async () => {
  const response = await handleEbayAccountDeletionNotification(new Request('https://app.oriafuture.com/api/v1/health'), {});
  assert.equal(response, null);
});
