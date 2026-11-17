# OriaFuture — Multi-Account E-commerce Operations Platform

[![Verify application](https://github.com/zeeza10/MultiAcc-Ecommerce-Dashboard/actions/workflows/verify.yml/badge.svg?branch=main)](https://github.com/zeeza10/MultiAcc-Ecommerce-Dashboard/actions/workflows/verify.yml)
[![CodeQL](https://github.com/zeeza10/MultiAcc-Ecommerce-Dashboard/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/zeeza10/MultiAcc-Ecommerce-Dashboard/actions/workflows/codeql.yml)

OriaFuture is a multi-organization e-commerce operations dashboard for managing connected marketplace stores and their operational workflows: orders, catalog, inventory, procurement, warehouses, returns, 3PL fulfilment, invoicing, payments, payouts, reconciliation and reporting.

**Repository:** zeeza10/MultiAcc-Ecommerce-Dashboard  
**Production application:** https://app.oriafuture.com  
**Edge runtime:** Cloudflare Workers  
**System of record:** Supabase PostgreSQL

## Product capabilities

| Domain | Capabilities |
|---|---|
| Workspace & access | Supabase authentication, organization membership, roles and permissions |
| Marketplace | eBay seller accounts, OAuth, Sandbox/Production separation |
| Commerce | Orders, order items, customers and returns |
| Catalog & inventory | Workspace product catalog, SKU mapping, stock ledger and adjustments |
| Procurement | Suppliers, purchase orders and goods receipts |
| Warehouse | Warehouses, bins, locations and stock allocation |
| 3PL & fulfilment | Clients, rate cards, packaging, shipping and storage snapshots |
| Finance | Invoices, invoice items, payments, allocations, expenses and general ledger |
| Marketplace finance | eBay payouts, reconciliation and account-level finance allocations |
| Reporting | Operational and financial reports, filters and exports |
| Platform | Notifications, audit events, rate limits and health endpoints |

Role permissions determine which screens and actions are available. A listed capability does not imply that a third-party provider (such as a bank feed) is connected.

## Environments and data boundaries

- **Demo:** synthetic client-presentation records.
- **Sandbox:** eBay developer/test accounts and their test data.
- **Production:** real seller accounts and marketplace records.

The selected environment is a hard data boundary. “All Accounts” means all accounts in the selected environment only. Marketplace-owned records are scoped to a seller account; workspace catalog and operational resources are workspace-owned and carry an explicit environment where applicable. Never copy Demo or Sandbox records into Production or seed synthetic data against a real seller account.

## Technology stack

### Languages and formats

| Language / format | Usage |
|---|---|
| TypeScript | Worker, API, domain services, shared types and Node tooling |
| TSX | React components and screens |
| SQL / PLpgSQL | PostgreSQL schema, RLS, functions, triggers and seed migrations |
| JavaScript / ESM | Node validation scripts and configuration |
| CSS | Global styles and Tailwind entry point |
| HTML | SPA document shell |
| JSON / JSONC | npm manifests, lockfile, metadata and Wrangler configuration |
| YAML | GitHub Actions |
| Markdown | Engineering documentation |

### Frameworks, platforms and libraries

| Layer | Technology |
|---|---|
| UI | React 19, React DOM 19 |
| Language | TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS 4, @tailwindcss/vite |
| React integration | @vitejs/plugin-react |
| Icons | Lucide React |
| Motion | Motion |
| Edge runtime | Cloudflare Workers |
| Worker tooling | Wrangler 4, @cloudflare/vite-plugin |
| Compatibility | Workers nodejs_compat |
| Database | Supabase PostgreSQL |
| Identity | Supabase Auth, @supabase/supabase-js |
| Authorization | Organization membership, application permissions, PostgreSQL RLS |
| Legacy/local server | Express 4 |
| Marketplace | eBay APIs, OAuth 2.0 |
| AI SDK | @google/genai |
| Tests | Node.js test runner via tsx |
| CI/security | GitHub Actions, CodeQL, secret scanning, npm audit |

Resolved dependency versions are recorded in package-lock.json. The lockfile is the source of truth for reproducible npm installs.

## Architecture

```text
Browser
  ├─ React application (Vite build)
  ├─ Supabase Auth session (JWT)
  └─ /api/v1/* requests
          |
          v
Cloudflare Worker
  ├─ Request limits and browser security headers
  ├─ Supabase JWT validation
  ├─ Active organization and permission resolution
  ├─ Domain API routes
  └─ Supabase PostgreSQL (caller-scoped access + RLS)
```

The Worker entry point is worker/index.ts; authentication and dispatch are in worker/api.ts; domain handlers are under worker/routes/. Browser business requests should use src/services/api.ts and the browser-safe Supabase client in src/lib/supabase.ts.

The repository also contains a legacy Express application (server.ts and server/), retained during incremental migration. Do not assume every legacy Express workflow has already moved to Workers. New production functionality should follow the Worker + Supabase architecture unless a documented decision says otherwise.

### Architecture rules

1. Supabase Auth is the single identity/session provider.
2. The Worker authenticates business API requests and resolves the active organization.
3. Never trust a client-supplied organization ID as authorization.
4. Enforce organization and role permissions in the API; keep PostgreSQL RLS as a second isolation boundary.
5. Use caller-scoped JWT access for ordinary user operations; never expose service-role or secret keys to browsers.
6. Encrypt marketplace credentials at rest; never return tokens/ciphertext in API responses or logs.
7. Keep financial writes transactional, auditable and idempotent where appropriate.
8. Preserve existing business rules and data during incremental migration.

## Repository layout

```text
.
├── .github/workflows/       # CI, security and deployment workflows
├── docs/                    # Architecture, setup and operational guides
├── public/                  # Static assets
├── scripts/                 # Migration and security validation
├── server/                  # Legacy Express compatibility code
├── src/
│   ├── components/          # Domain screens and reusable UI
│   ├── context/             # Auth/workspace context
│   ├── lib/                 # Browser Supabase client
│   ├── services/            # Typed API facade
│   └── types.ts             # Shared frontend types
├── supabase/migrations/     # Ordered PostgreSQL migrations
├── worker/
│   ├── routes/              # Worker domain handlers
│   ├── api.ts               # Auth, permission checks and dispatch
│   └── index.ts             # Cloudflare Worker entry point
├── .env.example
├── .dev.vars.example
├── package.json
├── package-lock.json
├── vite.config.ts
└── wrangler.jsonc
```

## Prerequisites

- Node.js 22 (matches CI)
- npm and Git
- Authorized Supabase project access for database-backed testing
- Cloudflare account access for Worker preview/deployment
- eBay Developer credentials only when testing marketplace OAuth

## Local development

```bash
git clone https://github.com/zeeza10/MultiAcc-Ecommerce-Dashboard.git
cd MultiAcc-Ecommerce-Dashboard
npm ci
cp .env.example .env
cp .dev.vars.example .dev.vars
npm run dev
```

Populate only the local values required by your setup. Never commit .env, .dev.vars, credentials, OAuth tokens or private keys. Open the URL printed by Vite. The Worker health endpoint is /api/v1/health.

### npm scripts

| Command | Purpose |
|---|---|
| npm run dev | Vite + Cloudflare Worker development |
| npm run build | Production frontend/Worker build |
| npm run lint | TypeScript compiler check (no emit) |
| npm test | Worker boundary tests via Node test runner and tsx |
| npm run check:migrations | Migration filename/version consistency |
| npm run check:demo-finance | Demo finance migration and UI invariants |
| npm run cf:dry-run | Wrangler Worker deployment-bundle validation |
| npm run cf:dev | Wrangler local Worker development |
| npm run cf:typegen | Generate Cloudflare environment types |
| npm run deploy | Build and deploy with Wrangler (authorized maintainers only) |
| npm start | Build and start legacy Express compatibility server |

## Environment configuration

Templates are in .env.example and .dev.vars.example.

- VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are browser-exposed settings. Publishable keys are designed for public clients; RLS and server authorization remain mandatory.
- SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are Worker/server runtime settings.
- API_ORIGIN and ALLOWED_ORIGIN are local compatibility/runtime settings where applicable.
- eBay OAuth secrets, token-encryption keys, Supabase secret keys and other private credentials belong in Cloudflare Worker Secrets or an approved secret manager. Never put private credentials in wrangler.jsonc, source code, docs or browser bundles.

Use separate credentials and redirect URLs for Demo/Sandbox/Production workflows. Never reuse Production secrets in local or preview environments.

## Quality checks

Run the core checks before opening a pull request:

```bash
npm ci
npm run check:migrations
npm run check:demo-finance
npm run lint
npm test
npm run build
npm run cf:dry-run
```

A CI check passes only when its status is completed and conclusion is success. Running, skipped or neutral is not a pass. Review security alerts separately from build success. CI success does not prove a production database migration has been applied or live data is visible.

## Database migrations

- Keep schema changes and deterministic seeds under supabase/migrations/.
- Use unique 14-digit timestamp prefixes and descriptive snake_case names.
- Prefer additive, idempotent migrations with assertions for critical invariants.
- Review RLS, grants, triggers, RPC privileges and tenant/environment scope.
- Never use a destructive reset to fix missing Demo data.
- Apply Production migrations only after review and required CI success.
- After applying, verify the migration ledger and record counts by organization, environment and seller account.

See docs/FINANCE_DEMO_VALIDATION.md and supabase/migrations/README.md.

## Deployment

Production is hosted on Cloudflare Workers at https://app.oriafuture.com. GitHub main is the source of truth.

1. Work on an approved feature branch.
2. Open a pull request against main.
3. Wait for every required CI/security check to complete successfully.
4. Review the diff and migration impact.
5. Merge only after checks pass.
6. Verify Cloudflare deployment and the application health endpoint.
7. Independently verify Supabase migrations and live data invariants.

A successful build or merge alone is not proof of deployment.

## Security model

- Identity: Supabase Auth.
- API authentication: validated Supabase bearer token.
- Authorization: active organization membership and permission checks.
- Tenant isolation: organization-scoped queries and PostgreSQL RLS.
- Environment isolation: Demo, Sandbox and Production.
- Secrets: Cloudflare Worker Secrets; never source-controlled or browser-exposed.
- Marketplace tokens: encrypted at rest and never returned to clients.
- Request protection: Worker rate limits, request body limits, CORS allow-list and browser security headers.
- Finance integrity: immutable invoice semantics, transactional payment/ledger RPCs, audit trail and balanced journal assertions.

Report suspected vulnerabilities through GitHub private vulnerability reporting. See SECURITY.md.

## Known implementation boundaries

- Finance currently includes Expenses and Receivables/Payables Ageing; there is no separate Vendor Bills screen.
- A standalone bank-feed management screen and live bank-provider integration are not implied by seeded bank statement rows.
- eBay payouts and reconciliation are separate views from the general Finance screen.
- Demo finance seed migrations must be applied to Supabase before the completed Demo finance records and account allocations appear in store-filtered screens.
- Legacy Express/file-backed code remains during the staged Worker migration.

## Documentation

- docs/TECH_STACK.md — complete technology inventory
- docs/FINANCE_DEMO_VALIDATION.md — finance demo data, migration and live checks
- docs/ARCHITECTURE_BASELINE_2026-11-14.md — architecture audit baseline
- docs/PROJECT_STRUCTURE_AND_MIGRATION.md — migration boundaries
- docs/EBAY_OAUTH_READINESS.md and docs/EBAY_OAUTH_SETUP.md — marketplace OAuth
- docs/SUPABASE_AUTH_SETUP.md and docs/AUTHENTICATION_CONSOLIDATION.md — authentication
- supabase/migrations/README.md — migration history

## Contribution workflow

See CONTRIBUTING.md. Keep pull requests focused, document migration impact, add regression tests and do not merge while required checks are running or failing.
