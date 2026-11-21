# Oria Future — Phase 0 Technical Audit Baseline

**Audit date:** 2026-11-21  
**Repository:** `zeeza10/MultiAcc-Ecommerce-Dashboard`  
**Database:** Supabase project `nmlwnezlsqystjrvszcd`  
**Scope:** Read-only inspection of GitHub source and Supabase schema/security metadata. No Production business data was modified.

## 1. Executive outcome

Oria Future already has substantial foundations for the requested e-commerce ERP. The correct approach is to complete and connect the existing modules, not rebuild them.

The audit confirms:
- React + TypeScript frontend and Cloudflare Worker API entry point are present.
- Supabase is the central database and Auth provider.
- Worker routes already cover marketplace, orders/purchasing, returns, fulfilment, finance, inventory, reports, access and system configuration.
- The database already contains core product, SKU mapping, inventory, purchasing, warehouse, returns, invoicing, payment, expense, ledger, payout and reconciliation tables.
- All public base tables inspected have RLS enabled; the live policy catalog returned 228 policies across 62 tables.
- Current eBay OAuth scope list does not include Finances, Analytics or Post-Order-specific permissions. These integrations cannot be assumed to work until scope requirements and seller consent are handled.
- eBay API coverage in current code is materially narrower than the complete business scope: order and Inventory Item/Offer sync are implemented; dedicated eBay Finances, Analytics and Post-Order return ingestion were not found in the inspected Worker route code.
- Several internal modules have schema/UI foundations but are not yet supported by Production business records; observed records in key internal tables were Demo-only.

## 2. Existing architecture

### Frontend
- React 19 + TypeScript.
- Existing navigation and views include Dashboard, Orders, eBay Accounts, Products & SKUs, Inventory & Ledger, Stock Adjustments, Warehouse Hub, Locations & Bins, Suppliers, Purchase Orders, Warehouse Services, Pick & Pack, Shipping & Parcels, Storage Billing, Invoices, Payments, Expenses, Profitability, eBay Payouts & Treasury, Reconciliation, Reports, Notifications, Audit Log, Settings and Employee Access.
- API client is centralized in `src/services/api.ts`; it calls the authenticated Worker API under `/api/v1`.
- Supabase browser client uses the publishable key and PKCE session flow. The publishable key is public by design; secret/service keys must remain server-side.

### Cloudflare Worker
- Entry point: `worker/index.ts`.
- Router: `worker/api.ts`.
- Route modules observed: `dashboard`, `marketplace`, `system`, `fulfilment`, `finance`, `orders-purchasing`, `returns`, `inventory`, `dropshipping`, `reports`, `access`.
- Auth verifies the Supabase bearer token using `auth.getUser(token)`, checks active profile and organization membership, derives role permissions and individual GRANT/DENY overrides, then uses the caller JWT for repository reads and writes so RLS remains active.
- IP and user rate-limit bindings are supported.
- Cloudflare scheduled handler invokes marketplace sync. No scheduled job was run during this audit.

## 3. Current API implementation coverage

| Area | Current code evidence | Audit status | Remaining work |
|---|---|---|---|
| eBay OAuth / connected accounts | `worker/routes/marketplace.ts` | Foundation exists | Scope expansion consent, token lifecycle review, seller-level API health |
| eBay Orders | Fulfillment `GET /sell/fulfillment/v1/order` | Implemented baseline | Verify pagination/checkpoints/status mapping, add incremental tests |
| eBay Inventory Items | Inventory `GET /sell/inventory/v1/inventory_item` | Implemented baseline | Pagination, SKU coverage, product normalization |
| eBay Offers | Inventory `GET /sell/inventory/v1/offer` per SKU | Implemented baseline | Offer pagination, legacy listing coverage, listing report completeness |
| Legacy active listings | Trading API `GetMyeBaySelling` not present in inspected runtime | Not implemented | Evaluate ActiveList compatibility and pagination before Production use |
| eBay shipping fulfillments | No complete ingestion path confirmed in inspected code | Not confirmed | Add read-only shipping fulfillment sync and tracking event model |
| eBay buyer returns | Internal `/returns` route exists; Post-Order API ingestion not confirmed | Not implemented/verified | Verify Post-Order endpoint scopes and UK marketplace eligibility |
| eBay Finances | No `sell/finances/v1` runtime route found in inspected source | Not implemented | UK digital-signature support, seller re-consent to `sell.finances`, transaction/payout ingestion |
| eBay Analytics | No `sell/analytics/v1` runtime route found in inspected source | Not implemented | Seller re-consent to `sell.analytics.readonly`, report scheduling/retention |
| Seller account policies | OAuth scope includes `sell.account.readonly`; current account/config routes exist | Partial | Add required account privilege, subscription and policy reads |
| Internal products/SKUs | Product routes/repositories and SKU mapping tables exist | Partial | Master catalog completeness, unique SKU rules, multi-marketplace mapping validation |
| Internal inventory/ledger | Inventory repository and transactional stock adjustment RPCs exist | Partial | Production opening balances, immutable ledger audit, reconciliation with imported orders |
| Suppliers/PO/receiving | Purchasing route/repository and transactional RPCs exist | Partial | Supplier return workflow, supplier invoice/credit notes, approval and receiving completeness |
| Buyer returns | Returns route and transactional disposition RPC exist | Partial | Separate internal supplier returns from customer/eBay returns |
| Warehouse/locations | Warehouse repository and tables exist | Partial | Full stock movement/transfer, capacity and multi-location validation |
| Pick & Pack / Shipping | Fulfilment routes, packaging and shipping jobs exist | Partial | Operational scan/pick workflow, parcel records, carrier label/tracking integrations |
| Storage management | Storage snapshots and billing views exist | Partial | Accurate occupancy events and rate/charge rules |
| Storage bidding | No dedicated bidding tables or UI route found in inspected public schema/navigation | Not implemented | Define bidding/tender data model and workflow |
| Invoices/payments/expenses | Finance route and views exist | Partial | Production-ready invoice lifecycle, payment methods/reconciliation, expense approvals |
| Treasury/payouts | Payout/reconciliation views and tables exist | Partial | Import eBay Finances payout transactions and reconcile to bank feed |
| Profitability | Finance view exists | Partial | Traceable COGS, fees, shipping, returns, storage and overhead allocation |

## 4. Database audit

### Existing relevant table groups

- Catalog: `product_categories`, `products`, `marketplace_sku_mappings`.
- Marketplace: `marketplace_accounts`, `marketplace_credentials`, `marketplace_sync_runs`, `marketplace_sync_jobs`, `marketplace_sync_checkpoints`, `marketplace_integration_events`, `marketplace_listing_snapshots`.
- Orders: `orders`, `order_items`, `order_status_history`, `order_shipments`.
- Procurement: `suppliers`, `purchase_orders`, `purchase_order_items`, `goods_receipts`, `goods_receipt_items`, `returns`, `return_items`.
- Warehouse: `warehouses`, `warehouse_locations`, `stock_ledger`, `stock_adjustments`, `packaging_jobs`, `shipping_jobs`, `storage_snapshots`.
- Finance: `invoices`, `invoice_items`, `payments`, `payment_allocations`, `expenses`, `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `marketplace_payouts`, `payout_orders`, `bank_transactions`, `financial_reconciliations`.

### Structural gaps / design warnings

1. **Supplier Returns:** current `returns` records are order-linked and have no `supplier_id`. Supplier returns must be modelled separately from buyer/eBay returns.
2. **Storage Bidding:** no dedicated bid, tender, offer, award or bidding-round schema was found.
3. **Listing snapshots:** table exists, but the prior read-only account audit found zero snapshots for the affected seller. Current sync populates Inventory Item and Offer-derived snapshots; legacy Seller Hub listings are not guaranteed to be represented.
4. **Sync run observability:** `marketplace_sync_runs` has order counters and one overall status; checkpoints are resource-specific, but a persisted per-resource/per-step run model was not confirmed. This limits diagnosis of mixed Orders/Inventory outcomes.
5. **Financial provenance:** internal invoice/payment/expense records must remain distinct from eBay earnings, fees, refunds and payouts. A payout is not proof of a bank settlement; reconciliation needs an actual bank transaction.
6. **Inventory provenance:** marketplace availability, internal physical stock, reserved stock, incoming stock and damaged stock must remain separate facts. Do not overwrite internal ledger balances from an eBay listing quantity.

### Existing environment/data observations

The earlier read-only data count snapshot for this audit window found:
- Products: 17 DEMO; Suppliers: 8 DEMO; Purchase Orders: 6 DEMO; Goods Receipts: 3 DEMO.
- Returns: 3 DEMO; Stock Ledger: 19 DEMO; Stock Adjustments: 4 DEMO; Storage Snapshots: 5 DEMO.
- Invoices: 5 DEMO; Payments: 3 DEMO; Expenses: 5 DEMO; Marketplace Payouts: 6 DEMO.
- Orders: 35 DEMO and 128 PRODUCTION.
- Listing Snapshots: 0 rows at the point checked.

These are point-in-time counts, not a statement that the modules are nonfunctional. No record was changed or deleted.

## 5. RLS and access-control audit

Live Supabase metadata query returned:
- 62 public tables with RLS policies.
- 228 public RLS policies.
- No public base table was returned as having RLS disabled.
- No SELECT/UPDATE/DELETE policy was missing a USING expression in the policy catalog.
- No INSERT/UPDATE/ALL policy was missing a WITH CHECK expression in the policy catalog.

This is a structural baseline only, not a proof that each policy is semantically correct. Next security pass must:
1. Verify every tenant-owned table filters by the authenticated organization and cannot be reached by changing `X-Organization-Id`.
2. Verify CLIENT_USER restrictions and 3PL ownership for orders, stock, warehouse, finance and reports.
3. Verify server-only marketplace credentials, raw provider payloads and OAuth state remain inaccessible to ordinary authenticated users.
4. Inspect SECURITY DEFINER functions, grants, search_path and caller authorization.
5. Run positive and negative tenant-isolation tests with at least two organizations and multiple roles.

## 6. Important implementation findings

### 6.1 Generic Worker error response
`worker/api.ts` currently catches route errors and often returns only:
`The workspace database request could not be completed.`

This is safe from leaking raw database details, but it discards the correlation ID, route/stage, SQLSTATE/provider status and sanitized diagnostic context. The fix should preserve the safe user-facing message while writing structured server-side diagnostics with request ID, route, organization/account IDs, stage, safe error code, HTTP status, SQLSTATE and retryability. Never log bearer tokens, secrets, full addresses, buyer PII or unredacted raw payloads.

### 6.2 Route allowlist
`worker/permissions.ts` uses an explicit route-to-permission allowlist. Any unregistered route is rejected as HTTP 501 before reaching route handlers. New module endpoints must be added to the permission map and covered by tests.

### 6.3 eBay OAuth scopes
The current scope list in `worker/routes/marketplace.ts` contains:
- `https://api.ebay.com/oauth/api_scope`
- `https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly`
- `https://api.ebay.com/oauth/api_scope/sell.inventory.readonly`
- `https://api.ebay.com/oauth/api_scope/sell.account.readonly`
- `https://api.ebay.com/oauth/api_scope/commerce.identity.readonly`

Missing for planned read integrations:
- `https://api.ebay.com/oauth/api_scope/sell.finances`
- `https://api.ebay.com/oauth/api_scope/sell.analytics.readonly`
- Post-Order endpoint-specific scopes must be checked against the current eBay operation documentation before implementation.
- Feed Active Inventory Report requires `sell.inventory`, broader than current `sell.inventory.readonly`.

Do not change seller scopes silently. Prepare a clear consent/reconnect plan and ask for approval before changing Production seller authorization.

### 6.4 UK Finances prerequisite
For UK/EU-domiciled sellers, eBay Finances API calls require digital signatures. The Worker must implement and test the signing flow before making UK Production Finances calls. Do not treat adding the OAuth scope as sufficient.

## 7. Phase 0 completion checklist

- [x] Confirm repository and main branch.
- [x] Confirm Worker entry point and route modules.
- [x] Confirm frontend API client and major module views.
- [x] Inventory relevant database tables and columns.
- [x] Inspect RLS enablement and policy catalog counts.
- [x] Confirm current eBay OAuth scopes in source.
- [x] Identify missing eBay API families in inspected runtime.
- [ ] Complete route-by-route API coverage matrix against every frontend service method.
- [ ] Complete policy-by-policy semantic RLS review and two-tenant negative tests.
- [ ] Audit SECURITY DEFINER RPCs and execute grants.
- [ ] Audit every UI module against its exact Worker endpoint and repository implementation.
- [ ] Verify migration files in GitHub exactly match the live Supabase migration history.
- [ ] Produce a prioritized implementation backlog with acceptance tests.

## 8. Phase 1 implementation order (after audit gates)

1. Stabilize existing eBay order/inventory sync and listing snapshots; add per-resource sync-run steps, safe diagnostics and correct queue lifecycle.
2. Add legacy active listing retrieval (evaluate Trading API ActiveList; preserve current Inventory API path).
3. Add shipping fulfillment and Post-Order returns ingestion.
4. Add Account API reads and Seller Analytics.
5. Implement UK-compatible Finances API only after digital-signature verification and explicit seller re-consent.
6. Add reconciliation and profitability data contracts.

## 9. Safety boundaries

This report is documentation and audit only. It does not authorize:
- eBay Production syncs, API tests, retries or scheduled runs;
- additional Production OAuth scopes or seller re-consent;
- Supabase schema changes or migrations;
- inserting/updating/deleting Production business records;
- Cloudflare secret changes or deployment;
- merging code.

All subsequent implementation should be delivered as reviewable GitHub PRs. Production actions require separate explicit approval.
