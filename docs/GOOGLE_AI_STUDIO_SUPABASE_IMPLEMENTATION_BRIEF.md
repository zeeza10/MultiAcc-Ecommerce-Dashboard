# Google AI Studio Implementation Brief — MultiAcc Supabase Integration

Repository: zeeza10/MultiAcc-Ecommerce-Dashboard
Target branch: main
Supabase project ref: nmlwnezlsqystjrvszcd
Supabase URL: https://nmlwnezlsqystjrvszcd.supabase.co

## Objective
Implement the application code integration against the normalized Supabase schema already created in `supabase/migrations/`. The schema and permission/RLS foundation are live. Do not recreate, rename, drop, or reset database tables. Read the actual current `main` branch source code and both migrations before coding.

## Mandatory repository review
Read all relevant source files, not just filenames:
- `src/App.tsx`, all `src/components/*`, `src/services/api.ts`, `src/services/clientDb.ts`, `src/types.ts`
- `server/types.ts`, `server/routes.ts`, `server/db.ts`, `server/engine.ts`, `server/storage/*`, `server/ebayAdapter.ts`, `server/reports.ts`, `server.ts`
- `worker/index.ts`, `wrangler.jsonc`, `package.json`
- all files under `supabase/migrations/`

Use existing business logic and UI as the source of truth. Preserve current functionality and design. Do not replace working UI with a simplified demo.

## Database schema already provisioned
The migrations create organization-scoped tables for:
- organizations, profiles, organization_members, roles, permissions, role_permissions, user_invitations
- clients_3pl, rate_cards
- marketplace_accounts, marketplace_credentials, marketplace_sync_runs, marketplace_exceptions, marketplace_sku_mappings
- product_categories, products, customers, customer_addresses
- orders, order_items, order_status_history, order_shipments
- warehouses, warehouse_locations, stock_ledger, stock_adjustments
- suppliers, purchase_orders, purchase_order_items, goods_receipts, goods_receipt_items
- returns, return_items, storage_snapshots, packaging_jobs, shipping_jobs
- invoices, invoice_items, payments, payment_allocations, expenses
- chart_of_accounts, journal_entries, journal_entry_lines
- marketplace_payouts, payout_orders, bank_transactions, financial_reconciliations
- dropshipping_calculations, notifications, audit_logs, system_settings, import_jobs, export_jobs

Important data conventions:
- Money is stored as integer minor units (pence/cents), never floating point.
- Tenant/business records carry `organization_id`.
- `profiles.id` references `auth.users.id`; a database trigger creates profiles after Auth signup.
- `stock_balances` is a derived view/calculation from stock_ledger; do not create an independent mutable stock source.
- Marketplace credentials are not directly readable by authenticated browser clients. Keep OAuth secrets encrypted and access them only through trusted server-side code/secrets.
- RLS is enabled and permission-aware policies are installed. Do not bypass RLS with a service role key in the browser.

## Authentication requirements
1. Add and configure `@supabase/supabase-js` with Vite environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (or current Supabase publishable key naming, but never a secret/service-role key)
2. Implement AuthProvider/context and hooks for session, user, profile, active organization and membership/role.
3. Implement sign-in, sign-out, password reset, password update, email verification/resend, and auth-state restoration.
4. Never trust `x-user-id`, query-string user IDs, localStorage user IDs, user-editable metadata, or a frontend-selected role as proof of identity/authorization.
5. Remove the fallback that silently selects the first user or uses `usr_superadmin`.
6. Organization membership and permission must be checked from database-backed membership/role/permission data and enforced by RLS on every query.
7. Add an explicit first-organization/bootstrap and invitation acceptance flow. Do not auto-grant SUPER_ADMIN to arbitrary signups. The initial owner must be provisioned securely through a controlled admin/bootstrap process.
8. Do not store passwords or marketplace tokens in application localStorage.

## Backend/API requirements
1. Replace `data/database.json` as the production source of truth with Supabase PostgreSQL.
2. Replace `clientDb.ts` mock/local-storage fallback for production operations. A failed API/database request must return a visible error, not silently fall back to demo data.
3. Use a verified Supabase user JWT for backend requests. Verify token/session server-side; do not accept an identity supplied in an arbitrary header.
4. For Cloudflare Worker, use secure environment bindings and supported Supabase server/client patterns. Never expose a service-role/secret key to browser code. Validate Origin properly; reject disallowed origins instead of reflecting arbitrary origins.
5. Unify business rules so Express local development and Cloudflare Worker production do not implement different data behavior.
6. Add input validation, pagination, filtering, consistent API error shapes, and transaction-safe operations.
7. Use database transactions/RPCs for multi-row business operations: order creation/update, stock reservation/dispatch/return, PO goods receipt, invoice issue/void, payment allocation, payout reconciliation and double-entry journal posting.
8. Enforce idempotency for marketplace imports, payment processing and journal posting.
9. Keep immutable/auditable ledgers append-only. Never silently rewrite posted financial history.
10. Do not invent live eBay integration. Preserve mock/demo mode explicitly and label it; implement actual OAuth/API calls only when credentials and required scopes are configured.

## Module-by-module integration
For every visible module in the UI, map each action to a real API/database operation:
Dashboard; Orders; Products; Inventory; Adjustments; eBay Accounts; SKU Mapping; Suppliers; Purchase Orders; Goods Received; Returns; 3PL Clients; Fulfilment; Warehouse; Locations; Shipping; Storage; Customers; Invoices; Payments; Expenses; Finance/General Ledger; Payouts; Reconciliation; Profitability/Dropshipping; Reports; Notifications; Audit Logs; Settings; Roles/Permissions.

Do not leave controls that pretend to save data. If a function is not yet implemented, show a clear disabled/not-configured state rather than success with fake data.

## Required tests and acceptance criteria
For each module verify:
1. Does the UI action work?
2. Does the API/backend execute correctly?
3. Is the data persisted to Supabase and retrievable after refresh/new session?

Also test:
- Unauthenticated requests are rejected.
- User A cannot read or modify Organization B data.
- A CLIENT_USER cannot access another 3PL client's records.
- Roles cannot perform actions without the matching permission.
- Marketplace credentials are never exposed to browser users.
- Duplicate external marketplace orders are not imported twice.
- Stock ledger and journal posting are idempotent and transaction-safe.
- Payment allocations cannot exceed payment/invoice outstanding amounts.
- Journal entries cannot be posted unless debits equal credits.
- Build, TypeScript/lint and available automated tests pass.

## Delivery rules
- Work only on `main`, unless explicitly asked otherwise.
- Do not reset Supabase, drop tables, delete existing business data, or run destructive migrations.
- Do not deploy or connect real marketplace accounts without explicit approval.
- Make small, reviewable commits with clear messages.
- First report the exact files reviewed and the implementation plan. Then implement in phases, starting with Auth + organization bootstrap + API security, followed by core products/inventory/orders, then operations and finance.
- Report any schema mismatch before changing the database. If a new migration is needed, create a forward-only migration and explain it.
- Do not claim tests passed unless they were actually run and results are shown.

## Critical business rules to preserve
Read and preserve the existing detailed business rules in `server/engine.ts` and `server/routes.ts`, including stock state calculations, adjustment approval thresholds, order status transitions, 3PL ownership/client isolation, purchase receipt handling, invoicing/payment allocation, payout reconciliation, dropshipping profitability calculations and audit logging. If existing code contains contradictory or unsafe rules, document them and propose a correction rather than silently changing accounting behavior.
