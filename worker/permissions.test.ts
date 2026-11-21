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
    assert.equal(permissionByRoute('GET', '/ebay/sku-mappings'), 'marketplace.view');
    assert.equal(permissionByRoute('POST', '/ebay/sku-mappings'), 'marketplace.manage');
    assert.equal(permissionByRoute('GET', '/ebay/accounts/account-id/listings'), 'marketplace.view');
    assert.equal(permissionByRoute('POST', '/ebay/accounts/account-id/sync-active-listings'), 'marketplace.manage');
    assert.equal(permissionByRoute('GET', '/ebay/accounts/account-id/seller-account'), 'marketplace.view');
    assert.equal(permissionByRoute('POST', '/ebay/accounts/account-id/seller-account'), 'marketplace.manage');
    assert.equal(permissionByRoute('GET', '/ebay/accounts/account-id/returns'), 'marketplace.view');
    assert.equal(permissionByRoute('POST', '/ebay/accounts/account-id/sync-returns'), 'marketplace.manage');
    assert.equal(permissionByRoute('GET', '/ebay/accounts/account-id/analytics'), 'marketplace.view');
    assert.equal(permissionByRoute('POST', '/ebay/accounts/account-id/sync-analytics'), 'marketplace.manage');
    assert.equal(permissionByRoute('GET', '/ebay/accounts/account-id/finances'), 'marketplace.view');
    assert.equal(permissionByRoute('POST', '/ebay/accounts/account-id/sync-finances'), 'marketplace.manage');
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
  it('maps every implemented Worker route to its declared permission', () => {
    const cases: Array<[string, string, string | null]> = [
      ['GET', '/dashboard/kpis', 'dashboard.view'],
      ['GET', '/dashboard/charts', 'dashboard.view'],
      ['GET', '/ebay/accounts', 'marketplace.view'],
      ['GET', '/ebay/sku-mappings', 'marketplace.view'],
      ['POST', '/ebay/sku-mappings', 'marketplace.manage'],
      ['GET', '/ebay/accounts/account-id/listings', 'marketplace.view'],
      ['GET', '/ebay/integration/events', 'marketplace.view'],
      ['POST', '/ebay/accounts', 'marketplace.manage'],
      ['DELETE', '/ebay/accounts/account-id', null],
      ['GET', '/ebay/integration/config', 'settings.manage'],
      ['POST', '/ebay/integration/config', 'settings.manage'],
      ['POST', '/ebay/accounts/account-id/connect', 'marketplace.manage'],
      ['POST', '/ebay/accounts/account-id/sync', 'marketplace.manage'],
      ['GET', '/ebay/exceptions', 'marketplace.view'],
      ['POST', '/ebay/exceptions/exception-id/resolve', 'marketplace.manage'],
      ['GET', '/system/config', 'dashboard.view'],
      ['POST', '/system/config', 'settings.manage'],
      ['GET', '/audit-logs', 'audit.view'],
      ['GET', '/access/overview', 'users.manage'],
      ['POST', '/access/invitations', 'users.manage'],
      ['GET', '/notifications', 'dashboard.view'],
      ['GET', '/notifications/push/public-key', 'dashboard.view'],
      ['POST', '/notifications/push/subscriptions', 'dashboard.view'],
      ['DELETE', '/notifications/push/subscriptions', 'dashboard.view'],
      ['POST', '/notifications/notification-id/dismiss', 'dashboard.view'],
      ['GET', '/products', 'products.view'],
      ['POST', '/products', 'products.create'],
      ['GET', '/inventory/balances', 'inventory.view'],
      ['POST', '/inventory/allocations', 'inventory.manage'],
      ['GET', '/inventory/ledger', 'inventory.view'],
      ['GET', '/stock/adjustments', 'inventory.view'],
      ['POST', '/stock/adjustments', 'inventory.adjust'],
      ['POST', '/stock/adjustments/adjustment-id/decision', 'inventory.adjust'],
      ['GET', '/orders', 'orders.view'],
      ['GET', '/orders/count', 'orders.view'],
      ['GET', '/orders/order-id', 'orders.view'],
      ['POST', '/orders', 'orders.create'],
      ['PUT', '/orders/order-id', 'orders.edit'],
      ['POST', '/orders/order-id/transition', 'orders.edit'],
      ['GET', '/suppliers', 'purchasing.view'],
      ['POST', '/suppliers', 'purchasing.manage'],
      ['GET', '/purchase-orders', 'purchasing.view'],
      ['POST', '/purchase-orders', 'purchasing.manage'],
      ['POST', '/purchase-orders/po-id/approve', 'purchasing.manage'],
      ['POST', '/purchase-orders/po-id/receive', 'purchasing.manage'],
      ['GET', '/returns', 'returns.view'],
      ['POST', '/returns/return-id/disposition', 'returns.manage'],
      ['GET', '/3pl/clients', 'fulfilment.view'],
      ['GET', '/3pl/storage-snapshots', 'fulfilment.view'],
      ['POST', '/3pl/billing-preview', 'fulfilment.view'],
      ['GET', '/warehouse-services/summary', 'fulfilment.view'],
      ['GET', '/warehouse-services/packaging', 'fulfilment.view'],
      ['POST', '/warehouse-services/packaging', 'fulfilment.manage'],
      ['GET', '/warehouse-services/shipping', 'fulfilment.view'],
      ['POST', '/warehouse-services/shipping', 'fulfilment.manage'],
      ['GET', '/finance/invoices', 'finance.view'],
      ['POST', '/finance/invoices/invoice-id/void', 'finance.manage'],
      ['GET', '/finance/payments', 'finance.view'],
      ['POST', '/finance/payments', 'finance.manage'],
      ['GET', '/finance/expenses', 'finance.view'],
      ['GET', '/finance/ledger', 'finance.view'],
      ['POST', '/finance/allocations', 'finance.manage'],
      ['GET', '/payouts', 'finance.view'],
      ['POST', '/payouts/payout-id/confirm-deposit', 'finance.manage'],
      ['GET', '/reconciliation', 'finance.view'],
      ['GET', '/dropshipping/calculations', 'orders.view'],
      ['POST', '/dropshipping/calculations', 'products.create'],
      ['GET', '/warehouses', 'inventory.view'],
      ['POST', '/warehouses', 'inventory.manage'],
      ['POST', '/warehouses/warehouse-id/locations', 'inventory.manage'],
      ...Array.from({ length: 14 }, (_, index) => {
        const id = String(index + 1).padStart(2, '0');
        return ['GET', `/reports/R-${id}`, 'reports.view'] as [string, string, string];
      }),
    ];

    for (const [method, path, expected] of cases) {
      assert.equal(permissionByRoute(method, path), expected, `${method} ${path}`);
    }
  });

  it('rejects unsupported variants for sensitive and parameterized routes', () => {
    const rejected: Array<[string, string]> = [
      ['POST', '/ebay/accounts/account-id/listings'],
      ['GET', '/ebay/accounts/account-id/listings/'],
      ['PATCH', '/orders/order-id'],
      ['DELETE', '/orders/order-id'],
      ['GET', '/orders/order-id/transition'],
      ['PUT', '/purchase-orders/po-id/approve'],
      ['GET', '/returns/return-id/disposition'],
      ['POST', '/finance/invoices/invoice-id/void/'],
      ['GET', '/reports/R-15'],
      ['GET', '/reports/R-1'],
      ['POST', '/reports/R-01'],
      ['POST', '/system/reset-demo'],
      ['GET', '/unknown'],
    ];

    for (const [method, path] of rejected) {
      assert.equal(permissionByRoute(method, path), undefined, `${method} ${path}`);
    }
  });

});
