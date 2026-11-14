# Authentication Consolidation — Phase 1 Baseline

**Branch:** `architecture/phase-0-baseline-and-auth`  
**Scope:** Phase 0 audit baseline plus the first Phase 1 authentication consolidation increment.

## Canonical frontend authentication path

```text
src/main.tsx
   |
   v
src/context/AuthContext.tsx — AuthProvider + application gate
   |
   +--> src/lib/supabase.ts — the only browser Supabase client
   |
   +--> profiles + organization_members + bootstrap_organization RPC
   |
   v
src/App.tsx — useAuth() from the canonical context
   |
   v
src/services/api.ts — Supabase access token + selected organization header
```

- `AuthProvider` is now the single mounted application auth provider.
- The provider uses the existing Supabase JS SDK client in `src/lib/supabase.ts`.
- The existing signup, email verification, login, logout, password recovery/update, session restoration, profile lookup, and organization bootstrap flows have been retained.
- Email verification and password recovery redirect to the current application origin, so the same code works in local and deployed environments when those origins are included in the Supabase Auth redirect allowlist.
- The selected organization ID is stored as a client-side routing hint and sent as `X-Organization-Id`. It is not treated as proof of membership; the API independently verifies the authenticated user's active membership in that organization.
- `src/auth/AuthGate.tsx` remains as a compatibility re-export for any older imports, but the application entry point and App now import from the canonical context module.

## Legacy duplicate path retired

Repository search showed the second manual REST auth path was not mounted by `src/main.tsx` or consumed by `src/App.tsx`. It was isolated to:

`AuthScreen.tsx` → `AuthContext.tsx` → `supabaseAuth.ts`

That implementation independently managed access/refresh tokens, localStorage sessions, Auth REST requests, and PostgREST requests. The orphaned AuthScreen and manual REST auth service were removed after the active entry path was verified. The canonical context module replaced the old duplicate context file.

## API authentication and authorization

The existing Express API already verified Supabase bearer tokens using `auth.getUser(token)` and checked active profiles and organization membership. This increment strengthens that boundary:

- API middleware continues to validate the bearer token with Supabase Auth.
- Membership is selected against the requested `X-Organization-Id` header. If no header is provided and the account belongs to more than one active organization, the API returns HTTP 409 rather than silently choosing an organization.
- Role permission codes are loaded by the provider for permission-aware navigation and independently by the API using the caller's JWT; permission lookup therefore remains subject to the existing RLS policies.
- Sidebar modules and top-level quick actions are filtered by active workspace permission codes. App initialization and global search avoid calling endpoints the current role cannot access. This is a usability layer only; the server-side permission matrix remains authoritative.
- A route permission matrix now covers all 56 currently registered API routes. Unknown/unmapped routes fail closed.
- CSV report exports require `reports.export`, not merely `reports.view`.
- Super Admin receives the existing system-role wildcard; all other roles are checked against the database permission assignments.
- The Worker CORS allow-header list includes `X-Organization-Id`.

No service-role or secret key was added. No database migration, RLS policy, Worker deployment, or production setting was changed.

## Validation performed in source

- Confirmed `src/main.tsx` mounts the canonical AuthProvider.
- Confirmed `src/App.tsx` imports `useAuth` from the canonical context.
- Confirmed the orphaned manual REST auth path was isolated and removed.
- Compared the route permission map against the current Express route declarations: all 56 registered routes have a matching rule.
- Confirmed the permission names used by the route map exist in the live Supabase role/permission model.

## Required CI and manual acceptance tests

The repository's current CI workflow runs TypeScript checking and a Vite production build. The PR must pass both before merge. There is not yet a dedicated auth integration test suite.

Manual acceptance checklist:
1. Sign up using a new email address; confirm the email arrives.
2. Follow the verification link and confirm it returns to the current application origin.
3. Sign in and confirm the profile and workspace load.
4. Sign out and sign back in; confirm the session is restored after reload.
5. Request a password reset; follow the link and set a new password.
6. Confirm an unauthenticated API request receives 401.
7. Confirm a valid user without active organization membership receives 403.
8. Confirm a user cannot send another organization's ID and gain access; membership lookup must reject it.
9. Confirm a role without a required permission receives 403.
10. Confirm an unknown/unmapped API route is denied by the authorization middleware.

## Not yet complete

This PR does not claim that Phases 1–3 are complete. In particular:
- Existing business routes still use the legacy JSON-backed database; Phase 2 must replace this incrementally with real Supabase repositories before enabling production business data.
- The Worker still proxies API requests to `API_ORIGIN`; Phase 3 must test and migrate compatible services before removing that proxy.
- The demo-mode production safety gate remains in place.
- Full end-to-end auth tests, invitation workflows, multi-organization selection UI, and full RLS tenant-isolation tests remain follow-up work.
