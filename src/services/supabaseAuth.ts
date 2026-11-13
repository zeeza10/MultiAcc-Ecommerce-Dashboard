export interface SupabaseAuthUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type: string;
  user: SupabaseAuthUser;
}

export interface OrganizationMembership {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: string;
  client_3pl_id: string | null;
  is_active: boolean;
  roles?: { code: string; name: string } | null;
  organizations?: { id: string; name: string; slug: string } | null;
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const SESSION_KEY = 'nexusops_supabase_session';
const ACTIVE_ORG_KEY = 'nexusops_active_organization_id';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const supabaseConfigError = !isSupabaseConfigured
  ? 'Supabase configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your environment.'
  : '';

let cachedSession: SupabaseSession | null = null;
let refreshPromise: Promise<SupabaseSession | null> | null = null;

function readSession(): SupabaseSession | null {
  if (cachedSession) return cachedSession;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    cachedSession = raw ? JSON.parse(raw) as SupabaseSession : null;
  } catch {
    cachedSession = null;
    localStorage.removeItem(SESSION_KEY);
  }
  return cachedSession;
}

function saveSession(session: SupabaseSession | null) {
  cachedSession = session;
  if (session) {
    if (!session.expires_at && session.expires_in) {
      session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
  window.dispatchEvent(new CustomEvent('nexusops-auth-change'));
}

async function authRequest<T>(path: string, body?: unknown, accessToken?: string): Promise<T> {
  if (!isSupabaseConfigured) throw new Error(supabaseConfigError);
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.msg || payload.message || payload.error_description || payload.error || 'Authentication request failed.');
  return payload as T;
}

async function refreshSession(): Promise<SupabaseSession | null> {
  const session = readSession();
  if (!session?.refresh_token) return null;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const next = await authRequest<SupabaseSession>('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      saveSession(next);
      return next;
    } catch {
      saveSession(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function getAccessToken(): Promise<string | null> {
  let session = readSession();
  if (!session) return null;
  if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 60) {
    session = await refreshSession();
  }
  return session?.access_token || null;
}

export async function signIn(email: string, password: string) {
  const session = await authRequest<SupabaseSession>('token?grant_type=password', { email: email.trim(), password });
  saveSession(session);
  return session;
}

export async function signUp(email: string, password: string, fullName: string) {
  const result = await authRequest<{ user: SupabaseAuthUser; session?: SupabaseSession | null }>('signup', {
    email: email.trim(),
    password,
    data: { full_name: fullName.trim() },
    options: { emailRedirectTo: window.location.origin },
  });
  if (result.session) saveSession(result.session);
  return result;
}

export async function signOut() {
  const token = await getAccessToken();
  try {
    if (token) await authRequest('logout', undefined, token);
  } finally {
    saveSession(null);
    localStorage.removeItem(ACTIVE_ORG_KEY);
  }
}

export async function sendPasswordReset(email: string) {
  if (!isSupabaseConfigured) throw new Error(supabaseConfigError);
  const response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), redirect_to: window.location.origin }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.msg || payload.message || 'Could not request password reset.');
}

export async function updatePassword(password: string) {
  const token = await getAccessToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  await authRequest('user', { password }, token);
}

export async function getAuthenticatedUser(): Promise<SupabaseAuthUser | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await authRequest<SupabaseAuthUser>('user', undefined, token);
  } catch {
    saveSession(null);
    return null;
  }
}

export async function databaseRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Authentication required.');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as any)?.message || (payload as any)?.details || (payload as any)?.hint || 'Database request failed.');
  return payload as T;
}

export async function loadMemberships(): Promise<OrganizationMembership[]> {
  return databaseRequest<OrganizationMembership[]>(
    'organization_members?select=id,organization_id,user_id,role_id,client_3pl_id,is_active,roles(code,name),organizations(id,name,slug)&is_active=eq.true&order=joined_at.asc'
  );
}

export async function bootstrapOrganization(name: string, slug: string): Promise<string> {
  const result = await databaseRequest<string>('rpc/bootstrap_organization', {
    method: 'POST',
    body: JSON.stringify({ p_name: name, p_slug: slug }),
  });
  localStorage.setItem(ACTIVE_ORG_KEY, result);
  return result;
}

export function getActiveOrganizationId(): string | null {
  return localStorage.getItem(ACTIVE_ORG_KEY);
}

export function setActiveOrganizationId(id: string) {
  localStorage.setItem(ACTIVE_ORG_KEY, id);
}
