import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectivePermissions } from './permission-overrides';

describe('individual permission overrides', () => {
  it('keeps role defaults and adds only explicit employee grants', () => {
    const result = resolveEffectivePermissions('OPS_MANAGER', ['orders.view','orders.create'], [
      { effect: 'GRANT', code: 'finance.view' },
    ]);
    assert.deepEqual([...result].sort(), ['finance.view','orders.create','orders.view']);
  });

  it('lets an employee-specific deny remove a role default', () => {
    const result = resolveEffectivePermissions('OPS_MANAGER', ['orders.view','orders.create'], [
      { effect: 'DENY', code: 'orders.create' },
    ]);
    assert.deepEqual([...result], ['orders.view']);
  });

  it('applies grants and denies together without affecting other role members', () => {
    const result = resolveEffectivePermissions('OPS_MANAGER', ['orders.view','orders.create'], [
      { effect: 'GRANT', code: 'products.view' },
      { effect: 'DENY', code: 'orders.create' },
    ]);
    assert.deepEqual([...result].sort(), ['orders.view','products.view']);
  });

  it('keeps Super Admin organization-wide access protected', () => {
    assert.deepEqual([...resolveEffectivePermissions('SUPER_ADMIN', [], [
      { effect: 'DENY', code: 'orders.view' },
    ])], ['*']);
  });
});
