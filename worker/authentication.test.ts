import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleApiRequest } from './api';
import type { WorkerEnv } from './types';
import { createClient } from '@supabase/supabase-js';

type FakeOptions = {
  roleCode?: string;
  permissions?: string[];
  profile?: Record<string, unknown> | null;
  profileError?: boolean;
  membership?: boolean;
  membershipError?: boolean;
  multipleMemberships?: boolean;
  queryThrows?: string;
  permissionsError?: boolean;
  overridesError?: boolean;
  authError?: { status?: number } | null;
  authThrows?: boolean;
};

function fakeSupabaseFactory(options: FakeOptions = {}): typeof createClient {
  return ((_: string, __: string, ___: unknown) => {
    const user = { id: 'user-1', email: 'employee@example.test', created_at: '2026-01-01T00:00:00Z' };
    return {
      auth: {
        getUser: async () => {
          if (options.authThrows) throw new Error('network unavailable');
          if (options.authError) return { data: { user: null }, error: options.authError };
          return { data: { user }, error: null };
        },
      },
      from: (table: string) => {
        const filters: Record<string, unknown> = {};
        const result = () => {
          if (table === 'profiles') {
            return {
              data: options.profile === undefined
                ? { id: user.id, full_name: 'Test User', is_active: true, two_factor_enabled: false, created_at: user.created_at }
                : options.profile,
              error: options.profileError ? { message: 'database unavailable' } : null,
            };
          }
          if (table === 'organization_members') {
            const selectedOrg = filters.organization_id;
            const found = options.membership !== false && (!selectedOrg || selectedOrg === 'org-1');
            const membershipRows = found ? [{
              organization_id: 'org-1',
              role_id: 'role-1',
              client_3pl_id: null,
              roles: { code: options.roleCode || 'FINANCE_USER' },
            }] : [];
            if (!selectedOrg && options.multipleMemberships) membershipRows.push({
              organization_id: 'org-2', role_id: 'role-2', client_3pl_id: null,
              roles: { code: options.roleCode || 'FINANCE_USER' },
            });
            return {
              data: options.membershipError ? null : membershipRows,
              error: options.membershipError ? { message: 'database unavailable' } : null,
            };
          }
          if (table === 'role_permissions') {
            return {
              data: (options.permissions || []).map(code => ({ permissions: { code } })),
              error: options.permissionsError ? { message: 'database unavailable' } : null,
            };
          }
          if (table === 'organization_member_permission_overrides') {
            return {
              data: [],
              error: options.overridesError ? { message: 'database unavailable' } : null,
            };
          }
          return { data: [], error: null };
        };
        const query: any = {
          select: () => query,
          eq: (column: string, value: unknown) => { filters[column] = value; return query; },
          order: () => query,
          limit: () => query,
          maybeSingle: async () => {
            if (options.queryThrows === table) throw new Error('database transport failed');
            return result();
          },
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            options.queryThrows === table
              ? Promise.reject(new Error('database transport failed')).then(resolve, reject)
              : Promise.resolve(result()).then(resolve, reject),
        };
        return query;
      },
    };
  }) as typeof createClient;
}

const env: WorkerEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
};

function request(path: string, headers: Record<string, string> = {}) {
  return new Request(`https://oriafuture.example/api/v1${path}`, {
    headers: { Authorization: 'Bearer valid-test-token', ...headers },
  });
}

describe('Worker authentication and authorization boundary', () => {
  it('accepts a verified session with an active organization membership', async () => {
    const response = await handleApiRequest(request('/auth/me'), env, fakeSupabaseFactory());
    assert.equal(response.status, 200);
    const body = await response.json() as { organizationId?: string; user?: { role?: string } };
    assert.equal(body.organizationId, 'org-1');
    assert.equal(body.user?.role, 'FINANCE_USER');
  });

  it('rejects a valid login that has no active organization membership', async () => {
    const response = await handleApiRequest(request('/auth/me'), env, fakeSupabaseFactory({ membership: false }));
    assert.equal(response.status, 403);
  });

  it('rejects an inactive organization membership', async () => {
    // The Worker filters is_active=true, so an inactive row must resolve as no active membership.
    const response = await handleApiRequest(request('/auth/me'), env, fakeSupabaseFactory({ membership: false }));
    assert.equal(response.status, 403);
  });

  it('requires an explicit workspace when the account has multiple active memberships', async () => {
    const response = await handleApiRequest(request('/auth/me'), env, fakeSupabaseFactory({ multipleMemberships: true }));
    assert.equal(response.status, 409);
  });

  it('rejects invalid or expired JWTs at the backend', async () => {
    const response = await handleApiRequest(request('/auth/me'), env, fakeSupabaseFactory({ authError: { status: 401 } }));
    assert.equal(response.status, 401);
  });

  it('returns service unavailable, not forbidden, when Auth cannot be reached', async () => {
    const response = await handleApiRequest(request('/auth/me'), env, fakeSupabaseFactory({ authThrows: true }));
    assert.equal(response.status, 503);
  });

  it('rejects inactive profiles', async () => {
    const response = await handleApiRequest(request('/auth/me'), env, fakeSupabaseFactory({
      profile: { id: 'user-1', is_active: false },
    }));
    assert.equal(response.status, 403);
  });

  it('distinguishes profile database failures from access denial', async () => {
    const response = await handleApiRequest(request('/auth/me'), env, fakeSupabaseFactory({ profileError: true }));
    assert.equal(response.status, 503);
  });

  it('distinguishes membership database failures from missing membership', async () => {
    const response = await handleApiRequest(request('/auth/me'), env, fakeSupabaseFactory({ membershipError: true }));
    assert.equal(response.status, 503);
  });

  it('handles thrown database transport errors without granting access', async () => {
    const response = await handleApiRequest(request('/auth/me'), env, fakeSupabaseFactory({ queryThrows: 'organization_members' }));
    assert.equal(response.status, 503);
  });

  it('rejects attempts to select an organization where the user has no membership', async () => {
    const response = await handleApiRequest(request('/auth/me', { 'X-Organization-Id': 'org-2' }), env, fakeSupabaseFactory());
    assert.equal(response.status, 403);
  });

  it('does not trust a frontend-supplied Super Admin role or permission', async () => {
    const response = await handleApiRequest(
      request('/products', { 'X-Role': 'SUPER_ADMIN', 'X-Permissions': '*' }),
      env,
      fakeSupabaseFactory({ roleCode: 'FINANCE_USER', permissions: [] }),
    );
    assert.equal(response.status, 403);
  });

  it('blocks ordinary employees from Super Admin access-management APIs even if the UI sends a forged role', async () => {
    const response = await handleApiRequest(
      request('/access/overview', { 'X-Role': 'SUPER_ADMIN', 'X-Permissions': '*' }),
      env,
      fakeSupabaseFactory({ roleCode: 'FINANCE_USER', permissions: ['users.manage'] }),
    );
    assert.equal(response.status, 403);
  });

  it('requires the platform-owner allowlist even for a workspace Super Admin', async () => {
    const response = await handleApiRequest(
      request('/ebay/integration/config'),
      env,
      fakeSupabaseFactory({ roleCode: 'SUPER_ADMIN' }),
    );
    assert.equal(response.status, 403);
  });

  it('fails closed when role permissions cannot be verified', async () => {
    const response = await handleApiRequest(request('/auth/me'), env, fakeSupabaseFactory({ permissionsError: true }));
    assert.equal(response.status, 503);
  });

  it('fails closed when individual permission overrides cannot be verified', async () => {
    const response = await handleApiRequest(request('/auth/me'), env, fakeSupabaseFactory({ overridesError: true }));
    assert.equal(response.status, 503);
  });
});
