# Oria Future — Complete Business System Scope & API Integration Matrix

Audit baseline: 2026-11-21  
Repository: `zeeza10/MultiAcc-Ecommerce-Dashboard`  
Architecture: existing React + TypeScript app, Cloudflare Worker API/runtime, existing Supabase PostgreSQL/Auth. GitHub `main` remains the source of truth.

## 1. Product direction

Extend the existing Oria Future Dashboard into a multi-account e-commerce business management platform. This is an extension of the current product, not a rebuild.

Core rules:
- Keep the existing Production seller accounts, OAuth grants, orders, listings, and business records.
- Do not delete, rewrite, or fabricate provider data.
- Preserve provider IDs, timestamps, currencies, quantities, statuses, and source attribution exactly as supplied.
- Keep each marketplace record linked to its organization, marketplace account, and environment.
- Keep internal business transactions distinct from marketplace source records.
- Use read-only provider scopes wherever sufficient. Do not add write scopes or execute seller-side write operations without an explicit product decision.
- No Production sync, retry, scheduler run, migration, deployment, or merge is authorized by this planning document.
- Sandbox is optional test infrastructure only; Production remains the business environment.

## 2. Internal business modules (Oria Future owns these records)

| Module | Existing database foundation | Current audit observation | Required capability |
|---|---|---|---|
| Product Master | `products`, `product_categories` | 17 product rows, all DEMO | Product catalog, variants/attributes, cost basis, lifecycle |
| SKU Management | `products.sku`, `marketplace_sku_mappings` | 6 marketplace mappings | Organization SKU + seller/account-specific external SKU/listing mapping |
| Inventory Ledger | `stock_ledger` | 19 rows, all DEMO | Immutable stock movements with source/reference, location, quantity, cost |
| Stock Adjustments | `stock_adjustments` | 4 rows, all DEMO | Reasoned adjustments, approvals, audit trail |
| Supplier Management | `suppliers` | 8 rows, all DEMO | Supplier contacts, terms, lead times, currencies |
| Purchase Orders | `purchase_orders`, `purchase_order_items` | 6 PO rows, all DEMO | Draft/approve/send/receive, ordered vs received quantities |
| Goods Receiving | `goods_receipts`, `goods_receipt_items` | 3 receipts, all DEMO | Partial receiving, discrepancies, put-away and ledger posting |
| Supplier Returns | Existing `returns` is generic/customer-return oriented | 3 rows, all DEMO | Separate supplier-return workflow, supplier credit/debit and stock disposition |
| Warehouse Management | `warehouses`, `warehouse_locations` | 4 warehouses, 13 locations (environment mix to verify) | Zones, aisles, shelves, bins, capacities, transfers |
| Pick & Pack | `packaging_jobs` | 4 rows (environment mix to verify) | Pick waves, pick confirmation, packing, parcel association |
| Parcel Management | `order_shipments`, `shipping_jobs` | 0 order shipments; 3 shipping jobs | Parcels, labels, carrier, tracking events, dimensions/weight |
| Storage Management | `storage_snapshots` | 5 rows, all DEMO | Occupancy history, pallet/shelf/bin usage, charge calculation |
| Storage Bidding | No dedicated table confirmed in current public table inventory | Not implemented at schema level | Bids, offers, auction/tender rounds, awards, pricing history |
| Invoices | `invoices`, `invoice_items` | 5 invoices, all DEMO | Sales, supplier, service and expense invoices; immutable issue/void lifecycle |
| Payments | `payments`, `payment_allocations` | 3 payments, all DEMO | Receipts, disbursements, allocations, partial payments, refunds |
| Expenses | `expenses` | 5 expenses, all DEMO | Categorized operational costs and approvals |
| Treasury | `bank_transactions`, `marketplace_payouts`, `payout_orders`, `financial_reconciliations` | 8 bank transactions, 6 payouts, 10 payout-order links; verify environments | Cash position, payout matching, bank reconciliation, transfers |
| General Ledger | `chart_of_accounts`, `journal_entries`, `journal_entry_lines` | 14 accounts, 15 journals, 35 lines; verify environments | Double-entry accounting, period controls, auditability |
| Profitability | Derived from orders, landed cost, fees, shipping, refunds, expenses and ledger | No dedicated profitability fact table confirmed | Gross/net contribution by order, SKU, seller account, channel and period |

A row count is not proof that a module is production-ready. The audit shows that the listed business-domain records are currently DEMO-only in the tables checked (Products, Suppliers, POs, Goods Receipts, Returns, Stock Ledger, Adjustments, Storage Snapshots, Invoices, Payments, Expenses and Marketplace Payouts). Orders currently contain both DEMO and PRODUCTION rows. No existing records are to be deleted as part of this work.

## 3. eBay API integration matrix (seller-authorized, read-first)

### 3.1 Products, SKUs, inventory and active listings

| Data need | API / operation | Data expected | Notes |
|---|---|---|---|
| Seller inventory items and SKUs | Sell Inventory API: `GET /sell/inventory/v1/inventory_item`; `GET /sell/inventory/v1/inventory_item/{sku}` | Seller SKU, product aspects/details, condition, availability | Current code already calls paged inventory_item endpoint |
| Offers and active Inventory-API listings | Sell Inventory API: `GET /sell/inventory/v1/offer`; `GET /sell/inventory/v1/offer/{offerId}` | Offer/listing IDs, marketplace, price/currency, quantity, status | Current code fetches offers by SKU; verify pagination and all offers |
| Seller inventory locations | Sell Inventory API: `GET /sell/inventory/v1/location` | Seller-defined location identifiers and address/configuration | Keep eBay locations distinct from Oria Future warehouses |
| Legacy / Seller Hub Active Listings | Trading API `GetMyeBaySelling` with `ActiveList` | Active item IDs and listing details | Compatibility path for listings not represented in Inventory API; verify OAuth token compatibility, XML parsing and pagination before use |
| Bulk Active Inventory Report | Sell Feed API inventory task `LMS_ACTIVE_INVENTORY_REPORT` | Seller's active inventory report | Requires broader `sell.inventory` scope; do not request silently. Prefer Trading API evaluation first if feasible |
| Product catalog enrichment | Commerce Catalog API `GET /commerce/catalog/v1/product/{epid}`, product search | Catalog product details | Optional enrichment only; not a source of the seller's SKU stock or listing truth |

Important: an Inventory Item is not automatically an active listing. A matching published Offer or a Trading API active listing record is required. Preserve inventory quantity and offer/listing quantity as separate facts. Do not assume all Seller Hub listings are in the Inventory API model.

### 3.2 Orders, shipping and returns

| Data need | API / operation | Data expected | Notes |
|---|---|---|---|
| Paid/checked-out orders | Sell Fulfillment API: `GET /sell/fulfillment/v1/order`, `GET /sell/fulfillment/v1/order/{orderId}` | Order IDs, line items, buyer/shipping details, payment and fulfillment state, totals/taxes | Existing order sync uses this API; default query covers recent orders and must use incremental checkpoints |
| Shipment / package tracking | Sell Fulfillment API: `GET /sell/fulfillment/v1/order/{orderId}/shipping_fulfillment` | Fulfillment IDs, carrier, tracking number, line items, shipped date | Read-only import first; do not create or revise shipments during initial integration |
| Returns | Post-Order API: `GET /post-order/v2/return/search`, `GET /post-order/v2/return/{returnId}`, `GET /post-order/v2/return/{returnId}/tracking` | Return request, reason, status, refund/label/tracking data | Verify exact OAuth scope and seller/marketplace eligibility per operation before coding |
| Cancellations and cases | Post-Order API cancellation, inquiry and case-management search/detail operations | Cancellation requests, INR cases, buyer inquiries and case state | Include in later customer-service phase |
| Disputes | Fulfillment API payment_dispute GET operations | Dispute status, activities and evidence metadata | Read-first; evidence submission/acceptance is a write operation and out of initial scope |

eBay Fulfillment order data covers completed checkout; pending-payment purchases may not appear in `getOrders`. Do not treat missing pending-payment purchases as sync failures.

### 3.3 Payments, payouts, fees and seller finances

| Data need | API / operation | Data expected | Notes |
|---|---|---|---|
| Order earnings | Sell Finances API: `GET /sell/finances/v1/order_earnings`, `GET /order_earnings/{orderId}`, `GET /order_earnings_summary` | Gross order earnings and fee/expense breakdowns | Reconcile against order ID and currency |
| Payouts | Sell Finances API: `GET /sell/finances/v1/payout`, `GET /payout/{payoutId}`, `GET /payout_summary` | Payout amount, status, date, instrument metadata, bank reference | Do not expose full bank details to ordinary users |
| Pending seller funds | Sell Finances API: `GET /sell/finances/v1/seller_funds_summary` | Available, processing and held funds | Snapshot with source timestamp |
| Monetary transactions / fees / refunds | Sell Finances API: `GET /sell/finances/v1/transaction`, `GET /transaction_summary` | Sales, fees, charges, credits, refunds and shipping-label transactions | Use transaction type and source IDs; deduplicate idempotently |
| Transfers | Sell Finances API: `GET /sell/finances/v1/transfer/{transferId}` | Transfers and charge details | Link to payout/transaction where eBay provides references |
| eBay billing activity | Sell Finances API: `GET /sell/finances/v1/billing_activity` | Billing activity records | Verify invoice/statement coverage and document availability |
| Legacy account invoice / balance | Trading API `GetAccount` | Seller account summary, fees and invoice data | Legacy fallback only; UK/EU calls have digital-signature requirements |

Critical UK seller requirement: eBay documents digital signatures for all Finances API methods made on behalf of UK/EU-domiciled sellers. The existing Worker must be audited for the required signature generation and request-header/body signing before any UK Production Finances call. A bearer token alone is not sufficient for those calls.

### 3.4 Seller account settings and analytics

| Data need | API / operation | Data expected | Notes |
|---|---|---|---|
| Seller status and selling limits | Sell Account API: `GET /sell/account/v1/privilege` | Registration completion, selling limit | Read-only |
| Seller subscription | Sell Account API: `GET /sell/account/v1/subscription` | Subscription details | Read-only |
| Business policies | Sell Account API: GET fulfillment_policy, payment_policy, return_policy | Shipping, payment and return policy settings | Read-only retrieval only |
| Rate tables and programs | Sell Account API: GET rate_table, program, payments_program | Seller shipping rate tables and program eligibility | Read-only |
| KYC / account program status | Sell Account API: GET kyc, payments_program | Eligibility/onboarding status where supported | Restrict sensitive data |
| Traffic and listing analytics | Sell Analytics API: `GET /sell/analytics/v1/traffic_report` | Impressions, views, CTR, conversion and listing metrics | Marketplace and report limits apply |
| Seller standards | Sell Analytics API: `GET /sell/analytics/v1/seller_standards_profile` | Seller ratings and performance profile | Marketplace availability varies |
| Customer service metrics | Sell Analytics API: `GET /sell/analytics/v1/customer_service_metric/{type}/{evaluationType}` | INR/SNAD metrics and benchmarks | Marketplace availability varies |

For Great Britain, Analytics API documents support for traffic reports and customer-service metrics. Respect API-specific marketplace availability and quotas.

## 4. Current OAuth authorization baseline (Production)

Read-only audit of currently connected Production seller credentials found this requested scope set:
- `https://api.ebay.com/oauth/api_scope`
- `https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly`
- `https://api.ebay.com/oauth/api_scope/sell.inventory.readonly`
- `https://api.ebay.com/oauth/api_scope/sell.account.readonly`
- `https://api.ebay.com/oauth/api_scope/commerce.identity.readonly`

The existing application code requests the same set.

Scope gaps / gates:
- Finances requires `https://api.ebay.com/oauth/api_scope/sell.finances`; it is not in the current seller grants.
- Analytics requires `https://api.ebay.com/oauth/api_scope/sell.analytics.readonly`; it is not in the current seller grants.
- Feed Active Inventory Report requires `https://api.ebay.com/oauth/api_scope/sell.inventory`, broader than the current read-only Inventory grant. Do not request it until its necessity and write-capability implications are reviewed.
- Post-Order return/cancellation operations require endpoint-by-endpoint scope verification before implementation; do not assume the existing Fulfillment read-only grant is sufficient.
- eBay states that adding scopes to an existing user grant requires renewed user consent. Refresh-token scope changes cannot be silently applied.
- UK Finances API digital-signature implementation and verification is a prerequisite before Production Finances calls.

No credentials, tokens, secrets, or authorization headers belong in source code or this document.

## 5. Data ownership and accounting rules

- eBay is the source of truth for eBay order/listing/return/fee/payout facts.
- Oria Future is the source of truth for internal products, supplier records, purchase orders, receiving, supplier returns, warehouses, pick/pack, storage, internal invoices, payments, expenses and internal journals.
- Bank feeds are the source of truth for cleared bank movements; eBay payout records are reconciled against bank credits, not treated as bank settlement by themselves.
- A product may map to multiple seller-specific SKUs/listings. Mapping must be organization- and marketplace-account-scoped; never match by SKU across unrelated sellers.
- Inventory ledger is append-only business history. Marketplace sync imports are idempotent source events; stock movements must not be duplicated on retries.
- Profitability is a calculated view: sales less refunds, marketplace fees, landed product cost, shipping/fulfilment/storage costs and allocated overhead. Keep gross sales, cash received and recognized profit separate.
- Internal invoices and payments are not the same as eBay billing statements, eBay order earnings or payout transactions.
- Supplier returns are not buyer/eBay returns; keep separate workflows and references.
- Raw marketplace payloads must remain server-side and privileged; expose only sanitized fields to normal employees.

## 6. Existing database audit snapshot (read-only)

Public tables relevant to this scope already exist:
- Catalog: `product_categories`, `products`, `marketplace_sku_mappings`
- Marketplace: `marketplace_accounts`, `marketplace_credentials`, `marketplace_sync_runs`, `marketplace_sync_jobs`, `marketplace_sync_checkpoints`, `marketplace_integration_events`, `marketplace_listing_snapshots`
- Orders: `orders`, `order_items`, `order_status_history`, `order_shipments`
- Procurement: `suppliers`, `purchase_orders`, `purchase_order_items`, `goods_receipts`, `goods_receipt_items`, `returns`, `return_items`
- Warehouse: `warehouses`, `warehouse_locations`, `stock_ledger`, `stock_adjustments`, `packaging_jobs`, `shipping_jobs`, `storage_snapshots`
- Finance: `invoices`, `invoice_items`, `payments`, `payment_allocations`, `expenses`, `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `marketplace_payouts`, `payout_orders`, `bank_transactions`, `financial_reconciliations`

All public tables returned by the Supabase table audit had RLS enabled. RLS policy correctness and tenant/account isolation still require a separate policy-by-policy audit; RLS enabled alone does not prove isolation.

Current observed counts on 2026-11-21:
- Products: 17 DEMO; Suppliers: 8 DEMO; Purchase Orders: 6 DEMO; Goods Receipts: 3 DEMO.
- Returns: 3 DEMO; Stock Ledger: 19 DEMO; Stock Adjustments: 4 DEMO; Storage Snapshots: 5 DEMO.
- Invoices: 5 DEMO; Payments: 3 DEMO; Expenses: 5 DEMO; Marketplace Payouts: 6 DEMO.
- Orders: 35 DEMO and 128 PRODUCTION.
- Marketplace Listing Snapshots: 0 rows at audit time.
- Sync jobs: 624 DEAD_LETTER, 54 FAILED, 668 QUEUED, 19 RUNNING, 282 SUCCEEDED.
- Sync runs: 481 COMPLETED, 1,431 FAILED, 4 PARTIAL, 341 RUNNING.

These counts are a point-in-time diagnostic only. Do not mass-retry, reset, delete, or update any job/run as part of the audit. Investigate account, environment, age, lease and event history before proposing a recovery operation.

## 7. Delivery plan (one phase at a time)

### Phase 0 — Audit and integration contract
1. Complete table/column/constraint/index audit and policy-by-policy RLS review.
2. Audit every UI module and its service/API route against the database foundation.
3. Audit current Worker routes, OAuth scope handling, token refresh, rate limiting, sync checkpoints and webhook coverage.
4. Produce module-by-module status: UI complete/incomplete, API complete/incomplete, persistence complete/incomplete, production data source, security tests.

### Phase 1 — Stabilize eBay read integrations
1. Complete listing coverage: Inventory API plus legacy ActiveList evaluation.
2. Fix sync run-step lifecycle, stuck RUNNING visibility and safe retry/reclaim rules.
3. Add read-only seller account settings and Analytics API.
4. Implement Finances API only after UK digital-signature work and renewed seller consent for `sell.finances`.
5. Implement Post-Order return retrieval after verifying scopes and supported UK marketplace behavior.
6. Keep each provider resource's sync status/checkpoint separate; partial success remains visible.

### Phase 2 — Production-ready internal operations
1. Product Master and seller-scoped SKU mapping.
2. Inventory Ledger, Stock Adjustments and warehouse location model.
3. Supplier Management, Purchase Orders, Goods Receiving and Supplier Returns.
4. Warehouse, Pick & Pack, Parcel and carrier integrations.
5. Storage Management and Storage Bidding.

### Phase 3 — Finance and profitability
1. Internal invoices, payment allocation, expense controls and treasury.
2. eBay payout/transaction ingestion and bank reconciliation.
3. Double-entry ledger reconciliation and audit trails.
4. Order/SKU/account-level profitability with traceable cost allocations.

### Phase 4 — UI, reporting and operational readiness
1. Complete existing pages and permissions; no duplicate modules.
2. Role-specific data visibility and Super Admin-only technical diagnostics.
3. Responsive desktop/tablet/mobile layouts.
4. Automated tests for idempotency, partial sync, tenant isolation, financial reconciliation and error recovery.

## 8. Safety gates

This plan is documentation only. It does not:
- run any eBay Production API call or seller sync;
- request new OAuth scopes or revoke/replace current grants;
- create or apply a Supabase Production migration;
- insert, update or delete Production business data;
- change Cloudflare secrets, deploy the Worker, or merge code.

Each later phase will be implemented in a reviewable GitHub branch/PR. Any Production scope re-consent, live API execution, database migration, deployment, or merge will be handled as a distinct controlled action.
