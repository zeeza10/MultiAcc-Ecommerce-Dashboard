# TECHNICAL CODE REVIEW & MIGRATION AUDIT REPORT
**Project:** MultiAcc E-Commerce Management Dashboard  
**Repository:** `zeeza10/MultiAcc-Ecommerce-Dashboard`  
**Target Branch:** `feature/cloudflare-supabase-integration`  
**Audit Date:** November 10, 2026  

---

## 1. COMPLETE FEATURE INVENTORY & SYSTEM STATUS

Below is the complete status of all 24 functional modules across Frontend, API Client, Express Backend (`server/*`), Cloudflare Worker (`worker/index.ts` & `src/services/clientDb.ts`), and PostgreSQL Database.

| # | Feature / Module | Frontend Status | API Client Status | Express Backend (`server/*`) | Cloudflare Worker (`worker/index.ts`) | Supabase PostgreSQL Status | Overall Feature Classification |
|---|---|---|---|---|---|---|---|
| **1** | **Dashboard & KPIs** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Dynamic engine) | Partially Implemented (Static defaults for 7 KPIs) | Missing Database | Partially Implemented |
| **2** | **Orders & Order Management** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Canonical state machine) | Partially Implemented (Bypasses RBAC & state transitions) | Missing Database | Partially Implemented |
| **3** | **Products & Catalog** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Cost masking for staff) | Implemented & Verified (Cost masking active) | Missing Database | Implemented but not tested (DB missing) |
| **4** | **Inventory & Stock Ledger** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Append-only ledger) | Simulated / Demo (Hardcoded product balances) | Missing Database | Simulated / Demo Functionality |
| **5** | **Stock Adjustments & Approvals** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Dual-control separation) | Partially Implemented (Auto-approves, no dual control) | Missing Database | Partially Implemented |
| **6** | **eBay Accounts & Synchronization** | Implemented & Verified | Implemented & Verified | Simulated / Demo (Mock 3-order generator) | Simulated / Demo (Static sync result object) | Missing Database | Simulated / Demo Functionality |
| **7** | **eBay Exceptions & SKU Mapping** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Auto-relinks pending orders) | Partially Implemented (In-memory update) | Missing Database | Implemented but not tested (DB missing) |
| **8** | **Suppliers & Purchase Orders** | Implemented & Verified | Implemented & Verified | Implemented & Verified (PO receiving & GRNI accrual) | Partially Implemented (Simple status toggle) | Missing Database | Implemented but not tested (DB missing) |
| **9** | **Goods Receiving (GRN)** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Posts double-entry GRNI) | Partially Implemented (In-memory toggle) | Missing Database | Implemented but not tested (DB missing) |
| **10** | **Returns & Customer Disposition** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Quarantine ledger & refund) | Partially Implemented (Status toggle only) | Missing Database | Implemented but not tested (DB missing) |
| **11** | **3PL Clients & Commercial Rate Cards** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Handling + storage billing) | Partially Implemented (Static billing object) | Missing Database | Implemented but not tested (DB missing) |
| **12** | **3PL Storage Snapshots** | Implemented & Verified | Implemented & Verified | Implemented & Verified | Partially Implemented (Returns empty list) | Missing Database | Partially Implemented |
| **13** | **Warehouse & Locations** | Implemented & Verified | Implemented & Verified | Local State Only (No API routes) | Local State Only (No API routes) | Missing Database | Simulated / Demo Functionality |
| **14** | **Warehouse Packaging Services** | Implemented & Verified | Implemented & Verified | Implemented & Verified | Implemented & Verified (In-memory store) | Missing Database | Implemented but not tested (DB missing) |
| **15** | **Warehouse Shipping Services** | Implemented & Verified | Implemented & Verified | Implemented & Verified | Implemented & Verified (In-memory store) | Missing Database | Implemented but not tested (DB missing) |
| **16** | **Invoices & AR Subledger** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Void reversal entry) | Partially Implemented (No financial ledger posting) | Missing Database | Partially Implemented |
| **17** | **Payments & Allocations** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Cash Dr / AR Cr) | Implemented & Verified (In-memory allocation) | Missing Database | Implemented but not tested (DB missing) |
| **18** | **Expenses & Allocation** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Read-only list) | Implemented & Verified (Read-only list) | Missing Database | Implemented but not tested (DB missing) |
| **19** | **Financial General Ledger** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Double-entry postings) | Partially Implemented (Static list) | Missing Database | Implemented but not tested (DB missing) |
| **20** | **eBay Payouts & Settlement** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Bank deposit confirmation) | Partially Implemented (Schema mismatch) | Missing Database | Partially Implemented |
| **21** | **Marketplace Reconciliation** | Implemented & Verified | Implemented & Verified | Implemented & Verified | Implemented & Verified (In-memory list) | Missing Database | Implemented but not tested (DB missing) |
| **22** | **Dropshipping Cost Calculator** | Implemented & Verified | Implemented & Verified | Implemented & Verified | Implemented & Verified | Missing Database | Implemented but not tested (DB missing) |
| **23** | **Reports (R-01 to R-14) & CSV Export** | Implemented & Verified | Implemented & Verified | Implemented & Verified (Full calculation engine) | Simulated / Demo (4 static rows for all reports) | Missing Database | Simulated / Demo Functionality |
| **24** | **System Audit Trail & Notifications**| Implemented & Verified | Implemented & Verified | Implemented & Verified | Partially Implemented (Missing mutation audit) | Missing Database | Security Vulnerability (Wipeable logs) |

---

## 2. DETAILED AUDIT FINDINGS & ISSUES

### SECTION A: CRITICAL SECURITY VULNERABILITIES (P0)

#### ISSUE ID: SEC-01
* **Severity:** Critical (P0)
* **Feature/Module:** Security / Authentication & JWT Validation
* **Exact File Path & Line Numbers:** `server/routes.ts:24-30`, `src/services/clientDb.ts:4302-4314`, `worker/index.ts:89-149`, `src/services/api.ts:32-39, 55-60`
* **Current Implementation:** Extract user identity strictly from unverified plaintext HTTP headers (`x-user-id`) or URL query parameters (`?userId=...`).
* **Actual Problem:** Zero cryptographic authentication or JWT token verification exists. Any HTTP client can spoof any user identity or administrative role simply by setting `x-user-id: usr_superadmin`.
* **Expected Behavior:** Requests must present a signed, valid Supabase JWT Bearer Token (`Authorization: Bearer <token>`) that is cryptographically validated on the backend.
* **Recommended Solution:** Integrate `@supabase/supabase-js` into the backend/worker request pipeline to parse and verify the JWT header against Supabase Auth (`supabase.auth.getUser(token)`).
* **Dependencies on Other Fixes:** DB-01, DB-02.

---

#### ISSUE ID: SEC-02
* **Severity:** Critical (P0)
* **Feature/Module:** Security / User Identity Verification
* **Exact File Path & Line Numbers:** `server/routes.ts:28-29`, `src/services/clientDb.ts:4307-4309`
* **Current Implementation:** `const user = raw.users.find((u) => u.id === userId); return user || raw.users[0];`
* **Actual Problem:** Unauthenticated or anonymous requests omitting the `x-user-id` header default to `users[0]`, which is `usr_superadmin` (`Sarah Jenkins`, role `SUPER_ADMIN`).
* **Expected Behavior:** Unauthenticated or anonymous requests to protected endpoints must return HTTP 401 Unauthorized.
* **Recommended Solution:** Remove the default fallback to `users[0]`. Reject requests lacking a valid session/token with an HTTP 401 JSON error response.
* **Dependencies on Other Fixes:** SEC-01.

---

#### ISSUE ID: SEC-03
* **Severity:** Critical (P0)
* **Feature/Module:** Security / System Administration Endpoints
* **Exact File Path & Line Numbers:** `server/routes.ts:1063-1071`, `src/services/clientDb.ts:5053-5056`
* **Current Implementation:** Unprotected endpoints `POST /api/v1/system/reset-demo` and `POST /api/v1/system/reload` execute full database resets without role checks.
* **Actual Problem:** Any unauthenticated remote user can issue a `POST` request to `/api/v1/system/reset-demo` to wipe all operational data, audit logs, and custom configurations.
* **Expected Behavior:** Administrative database resets must be restricted exclusively to authenticated `SUPER_ADMIN` users (or disabled entirely in production).
* **Recommended Solution:** Add strict `SUPER_ADMIN` role checks and disable database wipes in non-development environments.
* **Dependencies on Other Fixes:** SEC-01, SEC-02.

---

#### ISSUE ID: SEC-04
* **Severity:** Critical (P0)
* **Feature/Module:** Security / CORS Handling
* **Exact File Path & Line Numbers:** `worker/index.ts:34-57` (specifically line 48)
* **Current Implementation:** `const allowOrigin = isAllowedOrigin && origin ? origin : (origin || '*');`
* **Actual Problem:** When `isAllowedOrigin` is `false`, the ternary falls back to `(origin || '*')`, which reflects the untrusted caller's `Origin` header verbatim. As a result, arbitrary malicious origins are granted CORS access in production.
* **Expected Behavior:** Disallowed origins must not be reflected in `Access-Control-Allow-Origin`.
* **Recommended Solution:** Fix ternary logic: `const allowOrigin = isAllowedOrigin && origin ? origin : '';`.
* **Dependencies on Other Fixes:** None.

---

### SECTION B: HIGH-PRIORITY ISSUES (P1)

#### ISSUE ID: SEC-05
* **Severity:** High (P1)
* **Feature/Module:** Security / User Identity Enumeration
* **Exact File Path & Line Numbers:** `server/routes.ts:35-38, 1074-1077`, `src/services/clientDb.ts:4317-4319`
* **Current Implementation:** `GET /auth/users` and `GET /users` return the entire user directory to any caller.
* **Actual Problem:** An unauthenticated user can enumerate all system users, email addresses, roles, and client IDs, obtaining valid user IDs to spoof administrative sessions.
* **Expected Behavior:** User enumeration must require authenticated administrator privileges (`SUPER_ADMIN` or `OPS_MANAGER`).
* **Recommended Solution:** Require active authenticated session with `SUPER_ADMIN` or `OPS_MANAGER` role.
* **Dependencies on Other Fixes:** SEC-01.

---

#### ISSUE ID: SEC-06
* **Severity:** High (P1)
* **Feature/Module:** Security / User Account Status Validation
* **Exact File Path & Line Numbers:** `server/routes.ts:24-30`
* **Current Implementation:** Express `getActiveUser` extracts user by ID without inspecting `user.isActive`.
* **Actual Problem:** A deactivated or disabled user account (`isActive = false`) can continue executing API operations against the Express backend.
* **Expected Behavior:** Deactivated user accounts must be rejected with HTTP 403 Forbidden across all endpoints.
* **Recommended Solution:** Check `if (!user.isActive)` in middleware and throw an HTTP 403 error.
* **Dependencies on Other Fixes:** SEC-01.

---

#### ISSUE ID: SEC-07
* **Severity:** High (P1)
* **Feature/Module:** Security & Multi-Tenancy / 3PL Tenant Data Isolation
* **Exact File Path & Line Numbers:** `src/services/clientDb.ts:4325-4575, 4630-4650, 4769-4771, 4817-4840`, `server/routes.ts:424, 691, 784, 905, 1024, 1170`
* **Current Implementation:** Cloudflare Worker (`clientDb.ts`) does not filter Orders, KPIs, Charts, Inventory Balances, Ledger, or Invoices by `user.clientId` when `role === 'CLIENT_USER'`.
* **Actual Problem:** A 3PL client user (`usr_client_apex`) calling the Cloudflare Worker receives orders, inventory, financial ledger entries, and invoices belonging to the operator and competing 3PL clients.
* **Expected Behavior:** A 3PL client user must only access records where `clientId` or `ownerId` matches their assigned `user.clientId`.
* **Recommended Solution:** Implement strict tenant filtering on the Worker backend and enforce Supabase Row-Level Security (RLS) policies based on `auth.jwt() -> client_id`.
* **Dependencies on Other Fixes:** DB-01, DB-02.

---

#### ISSUE ID: SEC-08
* **Severity:** High (P1)
* **Feature/Module:** Security / Role-Based Access Control (RBAC)
* **Exact File Path & Line Numbers:** `server/routes.ts:486-502, 509-569, 584-686, 696-779, 910-978, 1104-1155, 1206-1268, 1278-1320`, `src/services/clientDb.ts:5045-5051`
* **Current Implementation:** Mutation endpoints for eBay sync, SKU mapping resolution, PO receiving, return disposition, payment recording, payout confirmation, warehouse services, and system configuration lack role authorization checks.
* **Actual Problem:** Any caller (including `VIEWER` or `CLIENT_USER`) can receive POs, resolve SKU mappings, confirm bank deposits, post general ledger entries, or overwrite system settings.
* **Expected Behavior:** Every mutation endpoint must enforce strict RBAC per the system permissions matrix.
* **Recommended Solution:** Add RBAC validation middleware to all state-modifying endpoints.
* **Dependencies on Other Fixes:** SEC-01.

---

#### ISSUE ID: INT-01
* **Severity:** High (P1)
* **Feature/Module:** Architecture / Backend Implementation Parity
* **Exact File Path & Line Numbers:** `server/routes.ts`, `server/engine.ts`, `server/reports.ts`, `worker/index.ts`, `src/services/clientDb.ts`
* **Current Implementation:** Two parallel backend codebases exist: Express (`server/*`) and Cloudflare Worker (`src/services/clientDb.ts`).
* **Actual Problem:** The two implementations have divergent seed data, business logic engines, report generation algorithms, and response structures, causing inconsistent behavior between local dev and Cloudflare deployment.
* **Expected Behavior:** A single, unified, platform-independent backend core servicing both Express and Cloudflare Workers.
* **Recommended Solution:** Refactor shared business logic into unified service modules that operate seamlessly over the `StorageAdapter` interface.
* **Dependencies on Other Fixes:** INT-04.

---

#### ISSUE ID: INT-02
* **Severity:** High (P1)
* **Feature/Module:** Infrastructure / Cloudflare Worker Data Persistence
* **Exact File Path & Line Numbers:** `worker/index.ts:13, 135`, `src/services/clientDb.ts:3844-3866, 4253-4260`
* **Current Implementation:** Cloudflare Worker state is maintained in an isolate-scoped in-memory object (`clientDb.data`), with `clientDb.save()` being a no-op because `localStorage` is undefined in V8 Isolate workers.
* **Actual Problem:** All data mutations made on Cloudflare Workers are ephemeral and reset whenever a cold start occurs or a request hits a different edge location.
* **Expected Behavior:** All backend mutations must persist to a durable, multi-region database (Supabase PostgreSQL).
* **Recommended Solution:** Wire `SupabaseStorageAdapter` into `worker/index.ts` to perform persistent SQL queries.
* **Dependencies on Other Fixes:** DB-01, INT-04.

---

#### ISSUE ID: INT-03
* **Severity:** High (P1)
* **Feature/Module:** eBay Integration / OAuth & Order Fetching
* **Exact File Path & Line Numbers:** `server/ebayAdapter.ts:22-37, 89-176`, `src/services/clientDb.ts:4702-4707`
* **Current Implementation:** `ebayAdapter.connect()` simulates token extension without OAuth redirect; `fetchOrders()` iterates over a local mock 3-order array with `Math.random()`.
* **Actual Problem:** Real live eBay marketplace stores cannot connect via OAuth 2.0 or fetch live orders from eBay Sell Fulfillment API (`/sell/fulfillment/v1/order`).
* **Expected Behavior:** Real OAuth 2.0 PKCE / Authorization Code token exchange and live HTTP REST calls to eBay API endpoints when credentials are configured.
* **Recommended Solution:** Implement full OAuth token management and live fetch client in `server/ebayAdapter.ts`.
* **Dependencies on Other Fixes:** None.

---

#### ISSUE ID: INT-04
* **Severity:** High (P1)
* **Feature/Module:** Architecture / Storage Abstraction Layer
* **Exact File Path & Line Numbers:** `server/storage/index.ts:1-105`
* **Current Implementation:** `StorageAdapter`, `MemoryStorageAdapter`, `FileStorageAdapter`, and `SupabaseStorageAdapter` are defined in `server/storage/index.ts` but never imported or instantiated.
* **Actual Problem:** The storage abstraction layer is completely disconnected, leaving `server/db.ts` tightly coupled to Node.js `fs` and `worker/index.ts` tied to `clientDb.ts`.
* **Expected Behavior:** Both Express server and Cloudflare Worker must instantiate and execute database operations through the unified `StorageAdapter` interface.
* **Recommended Solution:** Wire `StorageAdapter` into `server/db.ts` and `worker/index.ts`.
* **Dependencies on Other Fixes:** DB-01.

---

#### ISSUE ID: DB-01
* **Severity:** High (P1)
* **Feature/Module:** Database / Relational Schema Definition
* **Exact File Path & Line Numbers:** `supabase/migrations/`
* **Current Implementation:** No application database schema or migration files exist (only a temporary table smoke test file `20261110150000_github_integration_smoke_test.sql`).
* **Actual Problem:** There are no PostgreSQL tables, primary keys, foreign keys, or indexes created in Supabase for any of the 25+ application entities.
* **Expected Behavior:** A complete set of SQL migration files defining all 35 normalized relational tables, foreign keys, and indexes.
* **Recommended Solution:** Create structured, idempotent Supabase migration files covering all domain entities.
* **Dependencies on Other Fixes:** None.

---

#### ISSUE ID: DB-02
* **Severity:** High (P1)
* **Feature/Module:** Database / Row-Level Security (RLS) Policies
* **Exact File Path & Line Numbers:** `supabase/migrations/`
* **Current Implementation:** Zero Row-Level Security (RLS) policies exist.
* **Actual Problem:** Without RLS enabled, any client with the Supabase anon key can directly query or modify any table across all tenants via PostgREST.
* **Expected Behavior:** Every table must execute `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` with role- and tenant-scoped policies.
* **Recommended Solution:** Write complete RLS SQL policies enforcing role and tenant isolation based on `auth.uid()`.
* **Dependencies on Other Fixes:** DB-01.

---

### SECTION C: MEDIUM-PRIORITY ISSUES (P2)

#### ISSUE ID: SEC-09
* **Severity:** Medium (P2)
* **Feature/Module:** Orders / Order Editing Admin Override
* **Exact File Path & Line Numbers:** `server/routes.ts:305`
* **Current Implementation:** `allowOverride: body.allowOverride ?? true`
* **Actual Problem:** In Express, editing line items on a `Shipped` or `Delivered` order automatically defaults `allowOverride` to `true`, bypassing the safety check unless explicitly set to `false`.
* **Expected Behavior:** `allowOverride` must default to `false` and require explicit administrator confirmation.
* **Recommended Solution:** Change line 305 to: `allowOverride: Boolean(body.allowOverride)`.
* **Dependencies on Other Fixes:** None.

---

#### ISSUE ID: SEC-10
* **Severity:** Medium (P2)
* **Feature/Module:** Orders & Inventory / Worker RBAC & State Machine Validation
* **Exact File Path & Line Numbers:** `src/services/clientDb.ts:4385-4457, 4654-4696`
* **Current Implementation:** Cloudflare Worker `/orders` and `/stock/adjustments` endpoints ignore canonical state transitions and dual-control separation of duties.
* **Actual Problem:** Users can perform illegal status jumps or approve their own stock adjustments when calling the Cloudflare Worker.
* **Expected Behavior:** Cloudflare Worker must execute the exact same validation and dual-control rules as `server/engine.ts`.
* **Recommended Solution:** Align `clientDb.ts` handlers with `server/engine.ts` rules or delegate to a shared engine module.
* **Dependencies on Other Fixes:** INT-01.

---

#### ISSUE ID: SEC-11
* **Severity:** Medium (P2)
* **Feature/Module:** Inventory / Cost Price Masking for Warehouse Staff
* **Exact File Path & Line Numbers:** `server/routes.ts:402-419`, `src/services/clientDb.ts:4630-4650`
* **Current Implementation:** `GET /products` masks cost prices for `WAREHOUSE_STAFF`, but `GET /inventory/balances` and `GET /inventory/ledger` return unmasked cost values.
* **Actual Problem:** Warehouse staff can discover confidential cost prices by querying inventory balances or stock ledger endpoints.
* **Expected Behavior:** All endpoints returning stock ledger or balances must mask unit cost prices when called by `WAREHOUSE_STAFF`.
* **Recommended Solution:** Apply cost price masking to `/inventory/balances` and `/inventory/ledger` for `WAREHOUSE_STAFF`.
* **Dependencies on Other Fixes:** None.

---

#### ISSUE ID: INT-05
* **Severity:** Medium (P2)
* **Feature/Module:** API Alignment / Schema Discrepancies
* **Exact File Path & Line Numbers:** `server/routes.ts:1094-1102, 1183-1198`, `src/services/clientDb.ts:4875-4885, 4923-4945`
* **Current Implementation:** `GET /payouts` in Express omits `balances`; `GET /warehouse-services/summary` returns different JSON structures between Express and Worker.
* **Actual Problem:** Frontend UI components experience missing fields or rendering errors depending on which backend environment serves the request.
* **Expected Behavior:** Standardized, identical API response structures across both backend environments.
* **Recommended Solution:** Harmonize response models between `server/routes.ts` and `clientDb.ts`.
* **Dependencies on Other Fixes:** INT-01.

---

#### ISSUE ID: INT-06
* **Severity:** Medium (P2)
* **Feature/Module:** Finance / Double-Entry Ledger Posting on Invoice Voiding
* **Exact File Path & Line Numbers:** `server/routes.ts:877-887`
* **Current Implementation:** Voiding an invoice posts a single credit entry to `1200 Accounts Receivable` without a corresponding debit entry to Revenue.
* **Actual Problem:** Voiding an invoice causes trial balance reconciliation check (`Report R-14`) to report an unbalanced ledger (`Debits != Credits`).
* **Expected Behavior:** Voiding an invoice must post a balanced double-entry transaction (Debit Revenue `4000`, Credit Accounts Receivable `1200`).
* **Recommended Solution:** Add matching debit entry to Revenue account in `server/routes.ts:877-887`.
* **Dependencies on Other Fixes:** None.

---

#### ISSUE ID: INT-07
* **Severity:** Medium (P2)
* **Feature/Module:** Finance / Payout Deposit Confirmation Idempotency
* **Exact File Path & Line Numbers:** `server/routes.ts:1104-1155`
* **Current Implementation:** Re-submitting `POST /payouts/:id/confirm-deposit` on an already confirmed payout appends duplicate ledger entries without checking existing status.
* **Actual Problem:** Accidental double-submission duplicates bank deposit records and inflates cash ledger balances.
* **Expected Behavior:** Re-submitting confirmation on an already reconciled payout must return the existing record without appending duplicate financial entries.
* **Recommended Solution:** Check `if (payout.status === 'BANK_CONFIRMED')` and return early.
* **Dependencies on Other Fixes:** None.

---

#### ISSUE ID: DB-03
* **Severity:** Medium (P2)
* **Feature/Module:** Database / Relational Foreign Key Integrity
* **Exact File Path & Line Numbers:** `server/types.ts:79, 132, 206`
* **Current Implementation:** `ownerId` contains overloaded string values (`'operator'` vs `'client_apex'`).
* **Actual Problem:** Overloaded string identifiers prevent enforcing foreign key constraints to `clients_3pl(id)` in PostgreSQL.
* **Expected Behavior:** Schema must cleanly separate operator records from client records using explicit nullable foreign keys (`client_id`).
* **Recommended Solution:** Design tables with explicit `client_id` foreign keys and clean domain constraints.
* **Dependencies on Other Fixes:** DB-01.

---

#### ISSUE ID: TST-01
* **Severity:** Medium (P2)
* **Feature/Module:** Quality Assurance / Automated Test Suite
* **Exact File Path & Line Numbers:** Repository Root / `package.json`
* **Current Implementation:** No test runner or test files exist in the repository.
* **Actual Problem:** Business logic, canonical state transitions, and accounting entries cannot be validated automatically during build/CI.
* **Expected Behavior:** Comprehensive unit and integration test suite covering state machines, ledger postings, and RBAC rules.
* **Recommended Solution:** Set up Vitest and write unit/integration tests for critical business logic modules.
* **Dependencies on Other Fixes:** None.

---

## 3. RECOMMENDED CORRECTION SEQUENCE

To fix identified issues efficiently without breaking working features or causing regression, follow this sequential phase plan:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Security Hardening & Authentication (SEC-01..06, SEC-08)      │
│ - Integrate Supabase Auth JWT verification                              │
│ - Fix CORS origin reflection in worker/index.ts                         │
│ - Enforce strict RBAC checks across all mutation endpoints              │
│ - Remove default fallback to Super Admin on unauthenticated calls       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: PostgreSQL Schema & Supabase Integration (DB-01..03, INT-02)  │
│ - Generate 35 normalized PostgreSQL migration tables in /supabase       │
│ - Enable Row-Level Security (RLS) policies per role and tenant          │
│ - Connect Supabase JS client in Cloudflare Worker & Express             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Storage Abstraction & Backend Unification (INT-01, INT-04, 05) │
│ - Connect StorageAdapter layer across server/db.ts and worker/index.ts   │
│ - Unify business logic between Express and Worker                       │
│ - Standardize API response schemas                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: Accounting, Business Logic & Live Integrations (SEC-09..11,    │
│          INT-03, INT-06, INT-07, TST-01)                                 │
│ - Fix double-entry ledger posting on invoice voids & deposit checks     │
│ - Implement live eBay OAuth token management and REST fetch calls        │
│ - Add cost price masking to inventory balance endpoints                 │
│ - Add Vitest test suite for core state machines and accounting rules   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. EXACT FILES REQUIRING FUTURE MODIFICATIONS

1. `package.json` — Add `@supabase/supabase-js` and `vitest`.
2. `.env.example` — Document Supabase connection environment variables.
3. `wrangler.jsonc` — Bind Supabase environment secrets.
4. `worker/index.ts` — Fix CORS ternary logic, inject JWT authentication middleware, and replace in-memory `clientDb` handler with Supabase adapter.
5. `server.ts` — Attach authentication middleware and unify route bindings.
6. `server/routes.ts` — Add RBAC checks, cost price masking, fix invoice void ledger entries, and deposit idempotency.
7. `server/engine.ts` — Fix order edit admin override defaults and support Supabase async operations.
8. `server/ebayAdapter.ts` — Implement live OAuth PKCE/Authorization code exchange and eBay REST API client.
9. `server/storage/index.ts` — Connect `SupabaseStorageAdapter` to execute PostgreSQL queries.
10. `src/services/api.ts` — Attach Supabase Auth Bearer token to request headers.
11. `src/services/clientDb.ts` — Refactor/retire mock client database in favor of real Supabase client queries.
12. `supabase/migrations/20261110160000_initial_schema_and_rls.sql` — New SQL migration file establishing 35 normalized tables, foreign keys, indexes, and RLS policies.
