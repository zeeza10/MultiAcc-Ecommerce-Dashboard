import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPlatformAdminUser, readVerifiedJwtAssurance } from './platform-admin';

function tokenWithClaims(claims: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `header.${payload}.signature`;
}

describe('platform owner authorization', () => {
  it('requires an explicit exact user ID allowlist and the workspace Super Admin role', () => {
    assert.equal(isPlatformAdminUser('user-1', 'SUPER_ADMIN', 'user-1,user-2'), true);
    assert.equal(isPlatformAdminUser('user-1', 'SUPER_ADMIN', ' user-2 , user-1 '), true);
    assert.equal(isPlatformAdminUser('user-1', 'SUPER_ADMIN', 'user-10,user-2'), false);
    assert.equal(isPlatformAdminUser('user-1', 'VIEWER', 'user-1'), false);
    assert.equal(isPlatformAdminUser('user-1', 'SUPER_ADMIN', undefined), false);
    assert.equal(isPlatformAdminUser('user-1', 'SUPER_ADMIN', ''), false);
  });

  it('recognizes only an explicit aal2 assurance claim', () => {
    assert.equal(readVerifiedJwtAssurance(tokenWithClaims({ aal: 'aal2' })), 'aal2');
    assert.equal(readVerifiedJwtAssurance(tokenWithClaims({ aal: 'aal1' })), 'aal1');
    assert.equal(readVerifiedJwtAssurance(tokenWithClaims({})), 'aal1');
    assert.equal(readVerifiedJwtAssurance('not-a-jwt'), 'aal1');
    assert.equal(readVerifiedJwtAssurance('header.%%% .signature'), 'aal1');
  });
});
