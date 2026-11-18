import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithSessionRecovery } from './authenticatedFetch';

const invalidSession = () => new Response(
  JSON.stringify({ error: 'Your session is invalid or expired. Please sign in again.' }),
  { status: 401, headers: { 'Content-Type': 'application/json' } },
);

function makeAuthPort(overrides: Record<string, unknown> = {}) {
  const calls = { refreshSession: 0, signOut: 0, signOutScope: '' };
  const auth = {
    getSession: async () => ({ data: { session: { access_token: 'old-token' } }, error: null }),
    refreshSession: async () => {
      calls.refreshSession += 1;
      return { data: { session: { access_token: 'new-token' } }, error: null };
    },
    signOut: async (options: { scope: 'local' }) => {
      calls.signOut += 1;
      calls.signOutScope = options.scope;
      return { error: null };
    },
    ...overrides,
  };
  return { auth, calls };
}

test('preserves the session when an API request returns a temporary 503', async () => {
  const { auth, calls } = makeAuthPort();
  const response = await fetchWithSessionRecovery(
    async () => new Response(JSON.stringify({ error: 'Authentication service is temporarily unavailable.' }), { status: 503 }),
    auth,
    '/api/v1/config',
  );
  assert.equal(response.status, 503);
  assert.equal(calls.refreshSession, 0);
  assert.equal(calls.signOut, 0);
});

test('refreshes an explicitly rejected token once and retries with the new token', async () => {
  const { auth, calls } = makeAuthPort();
  const sentTokens: string[] = [];
  const response = await fetchWithSessionRecovery(
    async (_input, init) => {
      sentTokens.push(new Headers(init?.headers).get('Authorization') || '');
      return sentTokens.length === 1 ? invalidSession() : new Response('{}', { status: 200 });
    },
    auth,
    '/api/v1/config',
  );
  assert.equal(response.status, 200);
  assert.deepEqual(sentTokens, ['Bearer old-token', 'Bearer new-token']);
  assert.equal(calls.refreshSession, 1);
  assert.equal(calls.signOut, 0);
});

test('clears only the local session when Supabase confirms the refresh token is invalid', async () => {
  const { auth, calls } = makeAuthPort({
    refreshSession: async () => ({
      data: { session: null },
      error: { status: 400, code: 'refresh_token_not_found' },
    }),
  });
  await assert.rejects(
    fetchWithSessionRecovery(async () => invalidSession(), auth, '/api/v1/config'),
    /Your session has expired/,
  );
  assert.equal(calls.signOut, 1);
  assert.equal(calls.signOutScope, 'local');
});

test('preserves the session when token refresh fails temporarily', async () => {
  const { auth, calls } = makeAuthPort({
    refreshSession: async () => ({
      data: { session: null },
      error: { message: 'network unavailable' },
    }),
  });
  await assert.rejects(
    fetchWithSessionRecovery(async () => invalidSession(), auth, '/api/v1/config'),
    /session has been preserved/,
  );
  assert.equal(calls.signOut, 0);
});

test('clears only the local session if the refreshed token is also rejected', async () => {
  const { auth, calls } = makeAuthPort();
  await fetchWithSessionRecovery(async () => invalidSession(), auth, '/api/v1/config');
  assert.equal(calls.refreshSession, 1);
  assert.equal(calls.signOut, 1);
  assert.equal(calls.signOutScope, 'local');
});
