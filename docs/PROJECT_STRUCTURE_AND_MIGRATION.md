# Project Structure and Migration Boundaries

This document describes the current repository layout and the target boundaries for the ongoing migration. The migration is incremental: preserve existing screens, database tables, workflows and business rules while moving API execution to Cloudflare Workers.

## Current top-level structure

- `src/`: React + TypeScript application.
  - `src/App.tsx`: application shell, navigation and authenticated workspace flow.
  - `src/auth/`: authentication gate and session entry points.
  - `src/components/`: business screens and reusable UI, grouped by operational domain.
  - `src/services/api.ts`: typed frontend API facade. Components should call this facade rather than issuing fetch requests directly.
  - `src/lib/supabase.ts`: browser Supabase client for Auth/session management.
  - `src/types.ts`: shared frontend-facing domain types.
- `worker/`: Cloudflare Worker entry point and authenticated API dispatcher.
  - `worker/index.ts`: request routing, CORS and static asset serving.
  - `worker/api.ts`: API authentication, active-workspace resolution, permission gates and domain dispatch.
  - `worker/types.ts` and `worker/http.ts`: shared request context and JSON response helper.
  - `worker/routes/dashboard.ts`: dashboard KPI and chart aggregates.
  - `worker/routes/marketplace.ts`: account metadata, sync history, exception queue and SKU exception resolution.
  - `worker/routes/system.ts`: audit-log and notification endpoints.
  - `worker/*.test.ts`: Worker boundary tests.
- `server/`: legacy Express implementation and reusable domain repositories.
  - `server/repositories/`: Supabase-backed domain persistence adapters reused by the Worker.
  - `server/routes.ts`, `server/engine.ts`, `server/db.ts`: legacy route/business logic and file-backed compatibility code. Keep until each workflow has a tested Worker replacement.
- `supabase/`: migrations and database configuration.
- `docs/`: architecture, rollout, setup and operational documentation.
- `public/`: static assets and client-facing resources.

## Target Worker organization

As route coverage grows, split the current dispatcher into domain modules without changing public API paths:

- `worker/auth/`: bearer-token validation, active profile/workspace resolution and permission helpers.
- `worker/routes/dashboard.ts` (implemented): KPIs, chart aggregates and dashboard summaries.
- `worker/routes/marketplace.ts` (implemented): account metadata, sync history, exception queue and SKU exception resolution. Never return credential ciphertext or tokens.
- `worker/routes/system.ts` (implemented): audit logs and notification reads/dismissal.
- `worker/routes/fulfilment.ts` (implemented): 3PL clients, storage, packaging and shipping reads.
- `worker/routes/finance.ts` (implemented): invoices, payments, expenses, ledger, payouts and reconciliation reads.
- `worker/routes/inventory.ts` (implemented): product catalog, balances, stock ledger, stock adjustments, warehouses and locations.
- `worker/routes/orders-purchasing.ts` (implemented): order reads, creation/transitions, suppliers, purchase orders and goods receipts.
- `worker/routes/returns.ts` (implemented): return reads and disposition processing.
- `worker/routes/fulfilment.ts`: 3PL clients, storage, packaging and shipping.
- `worker/routes/finance.ts`: invoices, payments, expenses, ledger, payouts and reconciliation.
- `worker/routes/system.ts` currently handles audit and notifications; extend it with safe configuration endpoints.
- `worker/shared/`: validation, pagination and shared domain helpers (response and request-context helpers currently live at `worker/http.ts` and `worker/types.ts`).

## Non-negotiable architecture rules

1. Browser code uses Supabase Auth for sign-in/session and the Worker for business APIs.
2. Worker requests validate the caller's Supabase JWT and active organization membership.
3. Worker database access uses the caller JWT, never a service-role key for ordinary user requests; PostgreSQL RLS remains a second tenant-isolation boundary.
4. Every organization-owned query is constrained by the resolved organization and, where applicable, the user's 3PL client scope.
5. Marketplace credential ciphertext, refresh tokens and access tokens are never returned to browser clients.
6. Financial, inventory and fulfilment writes use validated, transactional database RPCs/repositories with audit and idempotency controls where required.
7. A workflow is removed from Express only after equivalent Worker behavior, authorization, tenant-isolation and regression tests pass.
8. No production deployment, schema reset or destructive data migration is part of this branch.

## Current migration coverage

- Worker: auth/session identity, Products, Inventory, Stock Adjustments, Orders, Suppliers, Purchase Orders, Goods Receipts, Returns, Warehouse, read-only Finance, read-only 3PL, dashboard aggregates, marketplace account metadata, exception queue, audit reads and notification reads/dismissal.
- Still gated: eBay OAuth/token lifecycle and sync execution; financial and 3PL writes; complete report/export workflows; remaining settings and dropshipping endpoints.
- UI must not present hard-coded sample metrics as live business data. Unavailable metrics must be explicitly marked or left at a neutral empty state until their source calculation is implemented.

## Validation gates

For every module: schema and RLS review → route implementation → frontend API contract alignment → authorization and tenant-isolation tests → TypeScript check → unit tests → production build → Cloudflare Preview runtime checks. Production remains unchanged until all gates pass.
