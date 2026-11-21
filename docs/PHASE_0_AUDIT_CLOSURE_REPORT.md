# Phase 0 Technical Audit — Closure Report

**Audit date:** 2026-11-21  
**Repository:** `zeeza10/MultiAcc-Ecommerce-Dashboard`  
**Production runtime:** Cloudflare Worker `multiacc-ecommerce-dashboard`  
**Database:** Supabase project `nmlwnezlsqystjrvszcd`

## Executive decision

The repository, Worker route layer, UI navigation/API client, live database metadata, RLS policies, function grants, migration inventory, and current Cloudflare preview evidence have been rechecked.

**Phase 0 is not yet release-complete.** The code and static security baseline are substantially mapped, but three release gates cannot honestly be marked passed: two-organization runtime isolation, migration-history reconciliation, and full semantic review of every SECURITY DEFINER function. Production migration/deployment verification also remains outstanding.

No Production migration was applied and no business data, eBay orders, credentials, sync queues, or schedules were changed during this audit.

## 1. UI → API → Worker → database module map

The existing application is not a blank rebuild. The following is the verified high-level route and persistence map from `src/App.tsx`, `src/services/api.ts`, Worker dispatch, route handlers, and repository files.

| UI module / view | Worker API families | Main database tables / repositories |
|---|---|---|
| Dashboard | `/dashboard/kpis`, `/dashboard/charts` | orders, products, stock ledger/balances, marketplace inventory allocations, invoices, expenses, marketplace payouts, system settings |
| eBay Accounts / Listings / Exceptions | `/ebay/accounts`, `/ebay/accounts/:id/listings`, `connect`, `sync`, `/ebay/exceptions`, integration config/events | marketplace accounts, credentials, OAuth states, sync jobs/runs, listing snapshots, integration events, exceptions, SKU mappings |
| Orders | `/orders`, `/orders/count`, order detail/create/edit/transition | orders, order items, order status history, customers/customer addresses where order workflows use them |
| Products & Inventory | `/products`, `/inventory/balances`, `/inventory/ledger`, allocations, adjustments, warehouses/locations | products, product categories, stock ledger, stock adjustments, warehouses, warehouse locations, marketplace inventory allocations, SKU mappings |
| Suppliers & Procurement | `/suppliers`, `/purchase-orders`, approve/receive | suppliers, purchase orders/items, goods receipts/items, stock ledger, invoices |
| Buyer Returns | `/returns`, disposition | returns, return items, orders/order items, stock ledger and refund-related finance records |
| Warehouse / 3PL | `/3pl/clients`, storage snapshots, billing preview, packaging/shipping jobs | clients_3pl, rate cards, storage snapshots, packaging jobs, shipping jobs, orders, invoices |
| Finance / Payouts | invoices, payments, expenses, ledger, allocations, payouts, deposit confirmation, reconciliation | invoices/items, payments/allocations, expenses, chart of accounts, journal entries/lines, marketplace payouts, payout orders, bank transactions, reconciliations, finance allocations |
| Reports | `/reports/R-01` … `/reports/R-14`, CSV export | orders, products, stock ledger/adjustments, purchasing, returns, 3PL, finance tables |
| Notifications | `/notifications`, dismiss, push key/subscriptions | notifications, web push subscriptions |
| Access / Settings / Audit | `/access/overview`, invitations, `/system/config`, `/audit-logs` | profiles, organizations, memberships, roles, permissions, role permissions, permission overrides, invitations, audit logs, system settings |

### Verified wiring gaps / corrections

- The Customers tab is currently an order-derived buyer summary, not a persistent customer-master CRUD module: no dedicated customer API methods or Worker customer CRUD route were found. It must not be described as a fully implemented customer master.
- The customer summary previously invented `customer@marketplace.com` when an order had no email and merged buyers by display name. This PR now removes the invented email and groups only by a real email; orders without an email remain separate instead of being merged by name.
- `api.resetDemo` exists as a stale API-client helper, but no caller was found and there is no matching Worker route. It is not part of the live user workflow.
- Raw marketplace payloads are returned only when `includeRawPayload` is enabled for `SUPER_ADMIN`; ordinary users do not receive raw payloads. There is no distinct Technical Admin role/permission in the current role catalog, so access remains Super Admin-only until a deliberate role is designed.

## 2. Tenant isolation and RLS

Live read-only database inspection returned:

- 65 public tables.
- 228 public RLS policies; 218 explicitly reference `organization_id`.
- One Production organization with five active memberships: one each for SUPER_ADMIN, OPS_MANAGER, FINANCE_USER, WAREHOUSE_STAFF, and VIEWER. No active CLIENT_USER membership was found.
- The live database currently has no second organization with active members. Therefore, a real two-organization, multi-role runtime isolation test cannot be executed against existing tenant data without creating a separate test tenant/environment.

The ten policies not matching the simple explicit-`organization_id` text check are special-case policies (membership/profile/self access, permission catalog, or server-only integration tables); they require semantic treatment rather than being counted as failures.

Three backend tables have RLS enabled and no policies: `ebay_account_deletion_events`, `marketplace_listing_snapshots`, and `marketplace_sync_checkpoints`. Read-only privilege checks confirmed that neither `anon` nor `authenticated` has SELECT on these tables; `service_role` does. This is a deny-by-default server-only posture, not an exposed-table finding.

**Status:** Static tenant/RLS review completed; two-organization runtime isolation remains a release gate because the live project has only one organization.

## 3. GitHub migration files vs Supabase migration history

Exact inventory comparison:

- GitHub migration files: **84**
- Supabase migration history entries: **83**
- Duplicate 14-digit GitHub migration prefixes: **0**

### GitHub-only versions (not present in live migration history)

1. `20261119100000_mark_invitation_accepted_after_password_setup`
2. `20261119120000_employee_lifecycle_first_login_activation`
3. `20261120220000_ebay_order_status_history`
4. `20261121140000_harden_customer_tenant_and_permissions`

### Live-history versions with no matching GitHub filename

1. `20261118130904_environment_safe_sync_foundation`
2. `20261118212452_mark_invitation_accepted_after_password_setup`
3. `20261118212453_employee_lifecycle_first_login_activation`

The invitation and employee-lifecycle migrations have same-name version drift between GitHub and the live history; the actual SQL/schema equivalence must be confirmed before any migration-history repair. The `20261120220000` order-status-history migration and `20261121140000` customer-tenant/permission migration are pending in the live database.

**Do not rewrite applied migration files or blindly mark versions applied.** Reconciliation must compare the SQL effects to the live schema, then use a reviewed forward-only migration or a deliberate migration-history repair plan. Production migration execution requires separate explicit approval.

## 4. SECURITY DEFINER function review

Current live metadata:

- 42 SECURITY DEFINER functions across `public` and `private`.
- All 42 have an explicit empty `search_path`.
- Zero are executable by `anon`.
- 32 are executable by `authenticated`; 14 are executable by `service_role` (some grants overlap).
- A database-wide static invariant query found no authenticated-executable function whose definition lacked both an `auth.uid()` identity check and an organization-permission helper reference.

Focused semantic review covered the organization bootstrap, membership activation/archive/suspension, role assignment/management, invitations, permission overrides, organization permission helpers, and the service-only marketplace import/queue/credential functions. Service-only functions inspected explicitly validate the `service_role` JWT claim; trigger-only functions have no direct anon/authenticated execute grant.

**Status:** Function metadata and access invariants verified; focused semantic review completed; the requested function-by-function semantic review of all 42 functions is not yet complete and remains a release gate. Static pattern checks are not a substitute for full logic review.

## 5. API contract, permission map, and handler checks

- Worker authentication validates the Supabase bearer token with `auth.getUser`, verifies active profile and organization membership, resolves role permissions plus explicit overrides, and builds a request-scoped Supabase client using the caller JWT.
- Unknown method/path combinations fail closed with 501 before route dispatch; missing module permissions return 403.
- `GET /orders/count` and `GET /ebay/accounts/:accountId/listings` are explicitly represented in the permission map on the PR branch.
- Order detail repository logic includes raw payload only for Super Admin.
- The UI API client contains a stale, unused `resetDemo` helper with no Worker handler. It is not a supported API contract.
- Customer master CRUD is not implemented; the current customer directory is derived from orders as described in section 1.

The module mapping above is a code-level contract inventory. Full request/response contract tests for every method, query parameter, role, and UI action have not yet been executed.

## 6. Build, test, and deployment evidence

- PR #158 was squash-merged to `main` at `5618378f83601dcd988edb3be9131338d8f68343`.
- The Cloudflare build for that main-branch commit failed on the malformed eBay listings permission regex. It did not deploy successfully.
- PR #159 corrects that regex. Cloudflare's Preview bot reported **Build: Success** and **Deployment: Success** for its original head commit `db079fb3b97e9c78d5eae463f47b68dbe33fee8d`.
- This audit PR adds a customer-directory data-integrity correction after that original preview. The updated PR head must receive a fresh Preview build before merge.
- GitHub Actions tests were not manually triggered because the repository's monthly Actions minutes were exhausted.
- No successful Production deployment of the PR #158 changes has been confirmed.
- No Production migration was applied; no eBay sync, queue retry, scheduler, OAuth scope change, or Production business-data write was run.

## 7. Final backlog and Phase 0 exit criteria

| Priority | Required action | Exit evidence |
|---|---|---|
| P0 | Obtain a disposable second organization/test environment and run cross-tenant read/write isolation tests for each active role | Automated test results proving tenant A cannot read/write tenant B |
| P0 | Reconcile the three live-only and four GitHub-only migration versions | Reviewed migration parity report; no destructive history rewrite |
| P0 | Complete line-by-line semantic review of all 42 SECURITY DEFINER functions | Function-by-function checklist with grants, identity checks, tenant scope, permission checks, and side effects |
| P0 | Fresh Cloudflare Preview build for the latest PR #159 head | Successful build and deployment for the latest commit |
| P0 | Obtain approval, then apply the reviewed pending Production migrations | Migration history and post-migration schema checks |
| P1 | Enable Supabase Leaked Password Protection | Supabase Auth security advisor warning cleared |
| P1 | Add a real customer-master API/UI backed by `customers` and `customer_addresses` if customer CRUD is in scope | Customer CRUD contract tests and role coverage |
| P1 | Add full endpoint/role contract tests and verify every visible UI action | Test matrix with no unexpected 501/404 paths |
| P1 | Complete Production smoke verification after approved merge/deploy | Health, auth, read-only module checks, and error-log review |

## Safety boundary

This report does not authorize Production migration execution, merge, Production deployment, eBay synchronization, OAuth scope changes, queue retries, or scheduler execution. Those actions remain separate approvals. Existing Production records and raw provider payloads must be preserved.
