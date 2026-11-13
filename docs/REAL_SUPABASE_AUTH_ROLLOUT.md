# NexusOps authentication rollout

## Implemented authentication foundation

- Browser sign-in uses Supabase Auth email/password with PKCE, persisted sessions, and automatic refresh.
- Signup requests email verification; password reset uses Supabase's recovery flow.
- The app loads the profile and active organization membership from Supabase.
- A user without a workspace can explicitly create one; the first member receives the workspace's configured owner role. Signup alone does not grant workspace access.
- The role-switching demo UI and browser localStorage demo database have been removed.
- Frontend API calls send the current Supabase access token as a Bearer token.
- The Express API verifies the token with Supabase Auth and checks the profile and active workspace membership.
- Business API requests fail closed by default while the old in-memory demo repository remains in use. The demo repository can only be enabled explicitly for local testing with NEXUS_DEMO_MODE=true.
- The Cloudflare Worker returns 503 for unavailable business API routes rather than serving demo records as if they were production data.

## Required environment variables

Set these in the local project root `.env` file and in the deployment build environment:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

The publishable key is safe for browser use. Never put a Supabase secret/service-role key in a `VITE_*` variable or browser bundle.

## Supabase Auth dashboard settings still required

1. Set the Site URL to the deployed application origin.
2. Add the local development origin (for example `http://localhost:3000/**`) and the deployed application origin to the Auth redirect URL allow list.
3. Keep email confirmation enabled.
4. Enable leaked-password protection and configure the minimum password strength according to the project's security policy.

## Important deployment limitation

The current Cloudflare Worker serves static assets only. It intentionally returns 503 for `/api/v1/*`. The Node/Express API has JWT verification, but the business endpoints still use the legacy in-memory demo repository. Production business routes are therefore blocked until those endpoints are migrated to the existing organization-scoped Supabase tables and verified with RLS. Do not set `NEXUS_DEMO_MODE=true` in production.

## Organization isolation status

The Supabase business tables already have `organization_id` columns and RLS policies. The policy audit found RLS enabled across the public tables; the credentials table intentionally has no client policies (default deny). The remaining work is to move the business API from the in-memory demo repository to organization-scoped Supabase queries so the existing RLS policies enforce isolation end-to-end.


## Cloudflare deployment variables

The frontend reads Supabase values at Vite build time. Configure these under the Cloudflare Pages/Workers build environment for both Preview and Production:

- `VITE_SUPABASE_URL=https://nmlwnezlsqystjrvszcd.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<the project's sb_publishable key>`

The Cloudflare Worker also needs:

- `API_ORIGIN=https://<your-express-api-host>` — origin only, no `/api/v1` suffix. The Worker proxies `/api/*` to this host and preserves the caller's Bearer token.
- `ALLOWED_ORIGIN=https://<your-frontend-domain>` — exact deployed frontend origin.

For local Vite/Express development, copy `.env.example` to `.env` and fill in the publishable key. For local Wrangler development, copy `.dev.vars.example` to `.dev.vars` and set API_ORIGIN to the local Express origin.

The publishable key is intentionally public and must still be protected by RLS. Never configure a Supabase secret/service-role key in Vite, Cloudflare browser variables, or any `VITE_*` variable.

## Supabase Auth URL configuration

In Supabase Dashboard → Authentication → URL Configuration:

- Site URL: the exact deployed frontend origin.
- Redirect URLs: add the exact local origin (for example `http://localhost:3000/**`) and deployed frontend origin (for example `https://app.example.com/**`).

Keep email confirmation enabled. In Authentication → Security and Protection (the exact menu label can vary), enable leaked-password protection.

## Current API migration boundary

The following reads now use the authenticated request's Supabase client, so database RLS is applied: app config, notifications, marketplace exceptions, marketplace accounts/sync runs, orders, and products. Other business routes are intentionally still behind the production safety gate until their read/write logic, transactional behavior, and organization-scoped policies are migrated and tested. Do not enable legacy demo mode in production.
