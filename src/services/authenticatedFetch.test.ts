import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithSessionRecovery } from './authenticatedFetch';

const invalidSession = () => new Response(
  JSON.stringify({ error: 'Your session is invalid or expired. Please sign in again.' }),
  { status: 401, headers: { 'Content-Type': 'application/json' } },
);

type TestAuthPort = {
  getSession: () => Promise<{ data: { session: { access_token: string } | null }; error: unknown | null }>;
  refreshSession: () => Promise<{ data: { session: { access_token: string } | null }; error: unknown | null }>;
  signOut: (options: { scope: 'local' }) => Promise<unknown>;
};

function makeAuthPort(overrides: Partial<TestAuthPort> = {}) {
  const calls = { refreshSession: 0, signOut: 0, signOutScope: '' };
  const auth: TestAuthPort = {
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
  };
  Object.assign(auth, overrides);
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

test('returns to the signed-out flow when no session exists at API startup', async () => {
  const { auth, calls } = makeAuthPort({
    getSession: async () => ({ data: { session: null }, error: null }),
  });
  await assert.rejects(
    fetchWithSessionRecovery(async () => new Response('{}'), auth, '/api/v1/config'),
    /Your session has expired/,
  );
  assert.equal(calls.signOut, 1);
  assert.equal(calls.signOutScope, 'local');
});

test('clears a definitively expired stored refresh session but preserves it on transient auth errors', async () => {
  const expired = makeAuthPort({
    getSession: async () => ({ data: { session: null }, error: { status: 400, code: 'refresh_token_not_found' } }),
  });
  await assert.rejects(
    fetchWithSessionRecovery(async () => new Response('{}'), expired.auth, '/api/v1/config'),
    /Your session has expired/,
  );
  assert.equal(expired.calls.signOut, 1);

  const temporary = makeAuthPort({
    getSession: async () => ({ data: { session: null }, error: { message: 'network unavailable' } }),
  });
  await assert.rejects(
    fetchWithSessionRecovery(async () => new Response('{}'), temporary.auth, '/api/v1/config'),
    /session has been preserved/,
  );
  assert.equal(temporary.calls.signOut, 0);
});

test('shares one refresh operation across concurrent startup API requests', async () => {
  let refreshCalls = 0;
  const auth = {
    getSession: async () => ({ data: { session: { access_token: 'old-token' } }, error: null }),
    refreshSession: async () => {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { data: { session: { access_token: 'new-token' } }, error: null };
    },
    signOut: async () => ({ error: null }),
  };
  const fetcher = async () => invalidSession();

  await Promise.all([
    fetchWithSessionRecovery(fetcher, auth, '/api/v1/config'),
    fetchWithSessionRecovery(fetcher, auth, '/api/v1/notifications'),
  ]);

  assert.equal(refreshCalls, 1);
});
