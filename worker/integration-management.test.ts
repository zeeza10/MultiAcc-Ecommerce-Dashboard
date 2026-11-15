import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('./routes/integration-management.ts', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL('../supabase/migrations/20261115110000_platform_integration_credentials.sql', import.meta.url),
  'utf8',
);

describe('platform integration credential management security contract', () => {
  it('requires both the immutable Super Admin role and platform-owner allowlist', () => {
    assert.match(route, /auth\.user\.role !== 'SUPER_ADMIN' \|\| !platformAdmins\.includes\(auth\.user\.id\)/);
    assert.match(route, /PLATFORM_SUPER_ADMIN_USER_IDS/);
  });

  it('requires AAL2 and same-origin browser requests before credential writes', () => {
    assert.match(route, /auth\.assuranceLevel !== 'aal2'/);
    assert.match(route, /!origin \|\| \(origin !== requestOrigin && origin !== env\.ALLOWED_ORIGIN\)/);
  });

  it('encrypts every credential field with environment and field-bound AAD', () => {
    assert.match(route, /encryptToken\(clientId, encryptionKey, aad\(environment, 'client-id'\)\)/);
    assert.match(route, /encryptToken\(clientSecret, encryptionKey, aad\(environment, 'client-secret'\)\)/);
    assert.match(route, /encryptToken\(ruName, encryptionKey, aad\(environment, 'runame'\)\)/);
  });

  it('never returns plaintext credentials and exposes only metadata', () => {
    assert.match(route, /secretsAreNeverReturned: true/);
    assert.match(route, /secretsReturned: false/);
    assert.doesNotMatch(route, /client_secret_ciphertext\s*:/);
    assert.doesNotMatch(route, /clientSecret\s*:/);
  });

  it('restricts database access to the service role and audits writes atomically', () => {
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /FORCE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.platform_integration_credentials FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.platform_integration_audit FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.save_platform_integration_credentials[\s\S]*TO service_role/);
    assert.match(migration, /INSERT INTO public\.platform_integration_audit/);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /credential version conflict/);
  });
});
