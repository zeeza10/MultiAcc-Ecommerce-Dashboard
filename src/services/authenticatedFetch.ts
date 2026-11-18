type SessionToken = { access_token: string } | null;

type AuthSessionPort = {
  getSession: () => Promise<{ data: { session: SessionToken }; error: unknown | null }>;
  refreshSession: () => Promise<{ data: { session: SessionToken }; error: unknown | null }>;
  signOut: (options: { scope: 'local' }) => Promise<unknown>;
};

const INVALID_SESSION_MESSAGE = 'Your session is invalid or expired. Please sign in again.';

let refreshInFlight: Promise<Awaited<ReturnType<AuthSessionPort['refreshSession']>>> | null = null;

function refreshSessionSingleFlight(auth: AuthSessionPort) {
  if (!refreshInFlight) {
    refreshInFlight = auth.refreshSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function isInvalidSessionResponse(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  try {
    const payload = await response.clone().json() as { error?: unknown };
    return payload?.error === INVALID_SESSION_MESSAGE;
  } catch {
    return false;
  }
}

function isDefinitiveRefreshFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; code?: unknown };
  return candidate.status === 400
    || candidate.status === 401
    || candidate.status === 403
    || candidate.code === 'refresh_token_not_found'
    || candidate.code === 'invalid_grant';
}

async function clearLocalSession(auth: AuthSessionPort): Promise<void> {
  // Local scope clears this browser's unusable credentials without revoking
  // other active sessions or changing the server-side account.
  try {
    await auth.signOut({ scope: 'local' });
  } catch {
    // AuthStateChange remains the source of truth if cleanup fails.
  }
}

/**
 * Refreshes only when the Worker explicitly rejects the bearer token.
 * Transient API failures never clear the user's local session.
 */
export async function fetchWithSessionRecovery(
  fetcher: typeof fetch,
  auth: AuthSessionPort,
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const current = await auth.getSession();
  if (current.error) {
    if (isDefinitiveRefreshFailure(current.error)) {
      await clearLocalSession(auth);
      throw new Error('Your session has expired. Please sign in again.');
    }
    throw new Error('Authentication could not be checked right now. Your session has been preserved. Please retry.');
  }
  if (!current.data.session?.access_token) {
    await clearLocalSession(auth);
    throw new Error('Your session has expired. Please sign in again.');
  }

  const send = (accessToken: string) => {
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${accessToken}`);
    return fetcher(input, { ...init, headers });
  };

  const firstResponse = await send(current.data.session.access_token);
  if (!(await isInvalidSessionResponse(firstResponse))) return firstResponse;

  let refreshed: Awaited<ReturnType<AuthSessionPort['refreshSession']>>;
  try {
    refreshed = await refreshSessionSingleFlight(auth);
  } catch {
    throw new Error('Authentication service is temporarily unavailable. Your session has been preserved. Please retry.');
  }

  if (refreshed.error) {
    if (isDefinitiveRefreshFailure(refreshed.error)) {
      await clearLocalSession(auth);
      throw new Error('Your session has expired. Please sign in again.');
    }
    throw new Error('Authentication service is temporarily unavailable. Your session has been preserved. Please retry.');
  }

  const refreshedToken = refreshed.data.session?.access_token;
  if (!refreshedToken) {
    await clearLocalSession(auth);
    throw new Error('Your session has expired. Please sign in again.');
  }

  const retryResponse = await send(refreshedToken);
  if (await isInvalidSessionResponse(retryResponse)) {
    await clearLocalSession(auth);
  }
  return retryResponse;
}
