import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  handleEbayAccountDeletionNotification,
  EBAY_ACCOUNT_DELETION_ENDPOINT,
  verifyEbayNotificationSignature,
} from './ebay-account-deletion';

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

test('eBay SHA1 notification signature validates against the exact raw request body', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const rawPayload = '{\n  "metadata": { "topic": "MARKETPLACE_ACCOUNT_DELETION", "schemaVersion": "1.0", "deprecated": false },\n  "notification": { "notificationId": "test-notification-id", "data": { "userId": "test-user-id" } }\n}';
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const signature = sign('sha1', Buffer.from(rawPayload, 'utf8'), privateKey);
  assert.equal(verifyEbayNotificationSignature(rawPayload, signature.toString('base64'), pem, 'SHA1'), true);
  assert.equal(verifyEbayNotificationSignature(JSON.stringify(JSON.parse(rawPayload)), signature.toString('base64'), pem, 'SHA1'), false);
});


test('eBay SHA256 notification signature remains supported', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const payload = { metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION' }, notification: { notificationId: 'id' } };
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const signature = sign('sha256', Buffer.from(JSON.stringify(payload)), privateKey);
  assert.equal(verifyEbayNotificationSignature(JSON.stringify(payload), signature.toString('base64'), pem, 'SHA256'), true);
});

test('POST rejects missing or malformed eBay signatures before any persistence', async () => {
  const response = await handleEbayAccountDeletionNotification(
    new Request(EBAY_ACCOUNT_DELETION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION' } }),
    }),
    {},
  );
  assert.ok(response);
  assert.equal(response.status, 412);
});

test('unrelated paths are not handled', async () => {
  const response = await handleEbayAccountDeletionNotification(new Request('https://app.oriafuture.com/api/v1/health'), {});
  assert.equal(response, null);
});
