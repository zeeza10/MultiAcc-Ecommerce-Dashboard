import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { permissionByRoute } from './permissions';

describe('Worker route permission policy', () => {
  it('allows authenticated identity reads without an additional module permission', () => {
    assert.equal(permissionByRoute('GET', '/auth/me'), null);
    assert.equal(permissionByRoute('GET', '/me'), null);
  });

  it('requires the expected permission for core business modules', () => {
    assert.equal(permissionByRoute('GET', '/products'), 'products.view');
    assert.equal(permissionByRoute('POST', '/products'), 'products.create');
    assert.equal(permissionByRoute('GET', '/orders'), 'orders.view');
    assert.equal(permissionByRoute('GET', '/orders/count'), 'orders.view');
    assert.equal(permissionByRoute('POST', '/orders'), 'orders.create');
    assert.equal(permissionByRoute('PUT', '/orders/order-id'), 'orders.edit');
    assert.equal(permissionByRoute('PATCH', '/orders/order-id'), undefined);
    assert.equal(permissionByRoute('GET', '/inventory/balances'), 'inventory.view');
    assert.equal(permissionByRoute('POST', '/inventory/allocations'), 'inventory.manage');
    assert.equal(permissionByRoute('POST', '/stock/adjustments'), 'inventory.adjust');
    assert.equal(permissionByRoute('GET', '/purchase-orders'), 'purchasing.view');
    assert.equal(permissionByRoute('POST', '/returns/return-id/disposition'), 'returns.manage');
  });

  it('requires separate permissions for finance, marketplace, audit and fulfilment data', () => {
    assert.equal(permissionByRoute('GET', '/finance/invoices'), 'finance.view');
    assert.equal(permissionByRoute('GET', '/ebay/accounts'), 'marketplace.view');
    assert.equal(permissionByRoute('GET', '/ebay/accounts/account-id/listings'), 'marketplace.view');
    assert.equal(permissionByRoute('POST', '/ebay/accounts/account-id/listings'), undefined);
    assert.equal(permissionByRoute('GET', '/ebay/accounts/account-id/unlisted-resource'), undefined);
    assert.equal(permissionByRoute('GET', '/ebay/integration/events'), 'marketplace.view');
    assert.equal(permissionByRoute('POST', '/ebay/exceptions/exception-id/resolve'), 'marketplace.manage');
    assert.equal(permissionByRoute('GET', '/audit-logs'), 'audit.view');
    assert.equal(permissionByRoute('GET', '/access/overview'), 'users.manage');
    assert.equal(permissionByRoute('POST', '/access/invitations'), 'users.manage');
    assert.equal(permissionByRoute('GET', '/3pl/clients'), 'fulfilment.view');
  });

  it('allows only explicitly supported routes and methods', () => {
    assert.equal(permissionByRoute('POST', '/finance/invoices/invoice-id/void'), 'finance.manage');
    assert.equal(permissionByRoute('POST', '/finance/payments'), 'finance.manage');
    assert.equal(permissionByRoute('POST', '/finance/allocations'), 'finance.manage');
    assert.equal(permissionByRoute('GET', '/system/config'), 'dashboard.view');
    assert.equal(permissionByRoute('POST', '/system/config'), 'settings.manage');
    assert.equal(permissionByRoute('DELETE', '/products'), undefined);
    assert.equal(permissionByRoute('GET', '/unknown'), undefined);
  });
});
