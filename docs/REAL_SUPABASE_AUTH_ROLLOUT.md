# NexusOps authentication rollout

## Implemented authentication foundation

- Browser sign-in uses Supabase Auth email/password with PKCE, persisted sessions, and automatic refresh.
- Signup requests email verification; password reset uses Supabase's recovery flow.
- The app loads the profile and active organization membership from Supabase.
- A user without a workspace can explicitly create one; the first member receives the workspace's configured owner role. Signup alone does not grant workspace access.
- The role-switching demo UI and browser localStorage demo database have been removed.
- Frontend API calls send the current Supabase access token as a Bearer token.
- The Express API verifies the token with Supabase Auth and checks the profile and active workspace membership.
- Production Express API requests fail closed while the old in-memory demo repository remains in use.
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
