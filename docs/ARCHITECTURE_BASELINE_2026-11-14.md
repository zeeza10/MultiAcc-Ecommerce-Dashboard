# MultiAcc E-commerce Dashboard — Architecture Baseline

**Audit date:** 2026-11-14  
**Repository:** `zeeza10/MultiAcc-Ecommerce-Dashboard`  
**Baseline branch:** `main`  
**Baseline commit:** `0f6d93af4494f37484c179e26d19f515408f04d4`  
**Deployment:** Cloudflare Worker `multiacc-ecommerce-dashboard`  
**Database:** Supabase project `nmlwnezlsqystjrvszcd`

## Scope and safety

This is a read-only source/configuration baseline. The audit inspected the repository tree, the primary frontend/auth/API/server/storage/Worker files, the recorded Supabase migrations, live table and policy metadata, Supabase security/performance advisories, and the deployed Worker settings. It was not a line-by-line review of every UI component, a penetration test, or a complete runtime dependency test.

No production code, database object, migration, Worker setting, secret, or deployment was changed during the audit.

## Existing architecture

- React 19 + TypeScript + Vite frontend.
- `src/main.tsx` mounts `AuthGate` around `App`.
- `src/lib/supabase.ts` creates the Supabase JS client used by the active `AuthGate` and API client.
- `src/services/api.ts` sends the Supabase access token to `/api/v1`.
- `server.ts` starts a separate Express 4 server and mounts `server/routes.ts`.
- `server/routes.ts` contains the business API and imports the engine, eBay adapter, reports service, and database.
- `server/db.ts` uses Node filesystem APIs and `data/database.json`.
- `server/storage/index.ts` defines file, memory, and Supabase adapters; the current Supabase adapter delegates to in-memory storage and is not a real PostgreSQL repository.
- `worker/index.ts` serves assets and proxies `/api/*` traffic to `API_ORIGIN`; it does not currently execute the Express application.
- `wrangler.jsonc` sets `nodejs_compat`, static assets, and Supabase URL/publishable-key variables.

## Confirmed runtime and deployment observations

- The deployed Worker settings inspected include the `ASSETS` binding, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`.
- The inspected deployed Worker settings did not include an `API_ORIGIN` binding. Since the Worker proxy requires it for non-health API routes, the Worker currently has no configured Express upstream in that deployment configuration.
- Worker compatibility date is `2025-03-01`; `nodejs_compat` is enabled.
- Worker logs are enabled; traces are disabled. Query-string redaction is disabled in the inspected observability settings.
- Repository default branch is `main`. At audit time, GitHub reported branch protection disabled.
- CI workflow `.github/workflows/verify.yml` runs TypeScript checking (`npm run lint`) and Vite production build (`npm run build`). No dedicated automated test suite was identified in the inspected project scripts/workflow.
- `package-lock.json` is absent; CI uses `npm install --no-package-lock`.

## Authentication dependency map

### Active application path

`src/main.tsx` → `src/auth/AuthGate.tsx` → `src/lib/supabase.ts` → `@supabase/supabase-js`

`src/App.tsx` consumes `useAuth` from `src/auth/AuthGate.tsx`. The active gate uses the Supabase SDK for signup, password login, session restoration, password reset/update, sign-out, profile lookup, organization membership lookup, and organization bootstrap RPC.

`src/services/api.ts` uses the same `src/lib/supabase.ts` client to obtain the current access token and attach it as a Bearer token to API requests.

### Orphaned duplicate path found in repository search

`src/components/AuthScreen.tsx` → `src/context/AuthContext.tsx` → `src/services/supabaseAuth.ts`

This second path manually implements Supabase Auth REST calls, refresh-token handling, localStorage session persistence, and direct PostgREST requests. Repository code search found these references within this legacy path, but did not find it wired from `src/main.tsx` or `src/App.tsx`. It is therefore an orphaned/unused duplicate implementation in the current application entry path, not evidence of two active providers at runtime.

The active `AuthGate` is already SDK-based. Consolidation should formalize it as the sole provider, verify all imports, and then retire the orphaned implementation safely. Do not remove it until reference checks and build validation pass.

## Backend, persistence, and business logic

- `server.ts` imports Node filesystem/path/url modules, starts Express on port 3000, and mounts Vite middleware for local development.
- `server/db.ts` imports `fs` and `path`, reads/writes `data/database.json`, and exposes a large mutable `DatabaseSchema`.
- `server/storage/index.ts` has a `SupabaseStorageAdapter` placeholder that currently delegates to `MemoryStorageAdapter`; it does not persist business records in PostgreSQL.
- The business routes use `db.getRawData()` and `db.save()` throughout. Moving persistence requires repository boundaries and incremental migration of route/service operations; swapping the adapter name alone is insufficient.
- Existing business logic in `server/routes.ts`, `server/engine.ts`, `server/reports.ts`, and `server/ebayAdapter.ts` should be preserved and separated from Express and storage-specific APIs.
- `src/services/clientDb.ts` is an additional frontend-side data/service implementation and must be compared against backend behavior before consolidation.

## Supabase baseline

- Live project was active/healthy and reported PostgreSQL 17.
- The live project exposed 53 tables in the inspected public schema; the live migration history showed seven applied migrations.
- Existing schema includes organizations, profiles, organization_members, roles, permissions, products, orders, inventory, suppliers, purchasing, returns, fulfilment/3PL, finance, marketplace, notifications, and audit-log structures.
- The migrations include initial schema creation, role/permission/RLS hardening, profile provisioning on auth signup, moving privileged helper functions to a private schema, public privilege hardening, and product permission correction.
- RLS was enabled on the inspected public tables. Existing policies include organization membership and permission checks through `private.is_org_member` and `private.has_org_permission` wrappers.
- Do not treat RLS being enabled as proof of correct tenant isolation. Policies and every query path must be tested with at least two organizations and multiple roles.

## Security and operational findings

1. **Marketplace credentials:** Supabase security advisory reported RLS enabled but no policies on `public.marketplace_credentials`. This is fail-closed for ordinary access, but a deliberate server-only credential access pattern is required before marketplace credentials are used.
2. **Password protection:** Supabase security advisory reported leaked-password protection disabled.
3. **Authorization:** Express middleware validates a Supabase bearer token with `auth.getUser(token)`, checks active profile and membership, and loads a role. A role being present is not a substitute for per-action permission checks. Route-level authorization and organization scoping require a full endpoint review.
4. **Legacy persistence:** Business routes still mutate shared JSON-backed state. This is not a safe multi-tenant production persistence model.
5. **Production safety gate:** Express routes contain a demo-mode gate that returns 503 while the legacy demo repository is in use. Preserve this guard until durable organization-scoped persistence is verified.
6. **CORS:** Worker CORS behavior should be changed to an explicit origin allowlist; it currently has a fallback that can reflect the request URL origin.
7. **Observability:** Query-string redaction is disabled and traces are disabled in the inspected Worker settings. Review before production rollout.
8. **Runtime compatibility:** `nodejs_compat` is enabled, but Express/Vite/filesystem and dependency compatibility is not established. The current server entry point uses filesystem and Vite middleware and must not be copied unchanged into a Worker.
9. **Dependency/release hygiene:** No lockfile and no dedicated test suite were identified in the inspected scripts/workflow. Add deterministic dependency installation and automated tests before production release.
10. **GitHub governance:** `main` was not protected at audit time. Require PR review and status checks before merging production changes.

Supabase performance advisories also identified foreign-key index opportunities, RLS initialization-plan warnings, permissive policy overlaps, and unused indexes. These need query-aware review; do not apply blanket index or policy changes without testing.

## Proposed target architecture

```text
React + TypeScript
       |
       | Supabase Auth session / access token
       v
Cloudflare Worker — single production API runtime
       |
       +--> JWT verification and request context
       |
       +--> Organization membership + permission authorization
       |
       +--> Application services / preserved business rules
       |
       +--> Repository interfaces
                    |
                    v
          Supabase JS client with user JWT
                    |
                    v
          Supabase PostgreSQL + RLS

GitHub: source of truth for code, tests, and versioned migrations
```

Supabase Auth remains the only identity provider. The browser uses one Supabase client. The Worker validates JWTs and enforces authorization. Ordinary user-scoped database operations should preserve the caller's JWT so RLS remains effective. Privileged secret/service-role credentials must never be exposed to the browser and must not be used as a shortcut around RLS.

The existing Express business logic should be preserved as framework-independent application services where practical. Express routes and middleware are runtime adapters, not the application core. Cloudflare integration is conditional on measured compatibility of the actual dependencies.

## Prioritized migration sequence

### Phase 1 — Authentication consolidation
1. Formalize one Supabase SDK client and one canonical AuthProvider.
2. Keep the existing active signup, email verification, login/logout, password recovery, and workspace onboarding behavior.
3. Retire the orphaned manual REST auth implementation only after import/reference checks and build validation.
4. Add server-side JWT validation in the Worker/API boundary.
5. Enforce active organization membership and permission checks; test role and tenant boundaries.

### Phase 2 — Real PostgreSQL persistence
1. Define repository interfaces by business aggregate.
2. Implement real Supabase repositories using existing tables and generated/verified database types.
3. Migrate one business domain at a time from mutable JSON operations.
4. Preserve business rules and transaction boundaries.
5. Add two-organization isolation tests.
6. Keep demo data isolated to local/test fixtures; do not silently fall back to memory in production.

### Phase 3 — Cloudflare backend integration
1. Inventory and test every Express dependency and middleware against Workers.
2. Extract compatible business services from Express/Node-specific entrypoints.
3. Mount compatible API handlers in the Worker runtime.
4. Replace filesystem persistence with repository operations before removing JSON usage.
5. Remove `API_ORIGIN` proxy only after route parity, regression tests, and production-like validation.
6. Keep any incompatible component out of the Worker until a demonstrated technical requirement is reviewed; do not add another host by default.

### Phase 4 — Production validation
1. Authentication, recovery, session and invitation/onboarding tests.
2. Permission matrix and cross-tenant negative tests.
3. Business workflow regression and persistence tests.
4. Marketplace credential handling and OAuth security.
5. Worker compatibility, logs/traces, CORS, secrets, and deployment verification.
6. PR-required branch protection and reproducible CI.

## Acceptance gates

- No production code or schema migration is changed without a reviewed PR.
- No new database table unless the existing schema demonstrably cannot support the requirement.
- No production JSON or in-memory persistence.
- No service-role/secret key in browser bundles or client configuration.
- Every business endpoint has explicit organization and permission authorization.
- RLS tests prove that organization A cannot read or mutate organization B's data.
- Build, type-check, automated tests, and Worker compatibility checks pass before deployment.
- Existing business workflows remain covered by regression tests.

## Audit limitations / items still requiring verification

- This baseline is not a full security penetration test.
- Not every React component, route handler, query, or third-party package has been reviewed line-by-line.
- The Supabase live policy inventory was inspected, but all policies have not yet been individually tested using multiple real user/organization contexts.
- Cloudflare deployed settings were inspected, but no Worker deployment or runtime request was changed or executed as part of this read-only baseline.
- Express/Worker dependency compatibility requires a reproducible build/runtime test before committing to the final migration strategy.
