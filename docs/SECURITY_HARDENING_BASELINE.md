# MultiAcc security hardening baseline

Audit date: 2026-11-18

This document records verified controls and outstanding platform-level work. It is not a claim that the application is impossible to compromise.

## Cloudflare edge

The following rules are active and scoped only to `app.oriafuture.com` so unrelated mail, cPanel, and other zone hostnames are not changed:

- Cloudflare Managed Free Ruleset is executed for the dashboard hostname.
- TLS 1.0 and TLS 1.1 connections are blocked for the dashboard hostname.
- HTTP requests are redirected to HTTPS while preserving the original path and query.
- The Worker emits HSTS and an enforced restrictive Content Security Policy on HTTPS responses, plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive Permissions Policy. Inline scripts and inline style blocks are not allowed; PDF report CSS is served from the same origin.
- API responses use `Cache-Control: no-store`.
- Worker rate limits are configured for IP traffic, reads, writes, and invitations.

Cloudflare's legacy zone `waf` setting is deprecated; Managed Rulesets are activated through the Rulesets phase entrypoint. The app-specific Managed Free Ruleset rule is therefore the active control. The zone is currently on Cloudflare's Free Website plan, so this is not equivalent to the full paid managed WAF/OWASP feature set. No zone-wide minimum-TLS or Always-HTTPS setting was changed because this DNS zone also contains mail and cPanel hostnames.

## Cloudflare Worker secrets

Verified binding types:

- `SUPABASE_SECRET_KEY`: `secret_text`
- `EBAY_TOKEN_ENCRYPTION_KEY`: `secret_text`
- `PLATFORM_SUPER_ADMIN_USER_IDS`: `secret_text`
- `SUPABASE_PUBLISHABLE_KEY`: `plain_text` (intended for public clients)
- `SUPABASE_URL`: `plain_text` (public project endpoint)

The Supabase publishable key and project URL are intentionally public browser configuration, not private credentials. They cannot be hidden from a browser that connects directly to Supabase; database safety therefore depends on RLS, grants, and authenticated authorization. The secret key, token-encryption key, and platform-admin identifiers are stored as Cloudflare `secret_text` bindings. Private keys and tokens must never be placed in browser bundles, GitHub source, or logs.

## Supabase database and Auth

Verified against the Production project:

- All 62 tables in the exposed `public` schema have RLS enabled.
- The `anon` role has zero direct table grants in `public`.
- The `platform_integration_credentials` and `platform_integration_audit` tables have RLS enabled, no browser grants, and explicit restrictive deny policies for `anon` and `authenticated`; server access remains `service_role` only.
- No public views or Storage buckets currently exist.
- The seven public organization-administration RPCs are now `SECURITY INVOKER` wrappers with an empty search path. Their unchanged privileged implementations live in the non-exposed `private` schema as `SECURITY DEFINER` functions with an empty search path. Super Admin assignment and invitation remain protected by AAL2 checks. `anon` and `PUBLIC` have no execute grants on these functions.
- The eBay credential-save RPC is service-role-only. The legacy RPC signature has been removed and the new signature requires a recent server verification timestamp.
- eBay application Client ID, Client Secret and RuName are stored only in ciphertext columns (`client_id_ciphertext`, `client_secret_ciphertext`, `ru_name_ciphertext`); the readable Client ID field is masked only. The current Sandbox application keypair has a successful eBay verification timestamp; seller OAuth authorization remains a separate per-account state. Production application credentials are not configured.
- Seller access and refresh tokens are stored in ciphertext columns (`access_token_ciphertext`, `refresh_token_ciphertext`); there are no plaintext token columns.
- All three credential/token tables (`platform_integration_credentials`, `platform_integration_audit`, `marketplace_credentials`) have RLS enabled, no `anon` or `authenticated` SELECT grants, and `service_role`-only SELECT access.
- Existing eBay app credentials remain encrypted but are intentionally marked unverified until replaced through the eBay verification flow.

Outstanding Auth item: Supabase Leaked Password Protection is disabled. The current Supabase organization is on the Free plan; Supabase documents this feature as available on Pro and above. Enable it after upgrading the project/organization to a supporting plan. Do not weaken other Auth controls to compensate.

## Database hardening completed on 2026-11-18

Production migrations `20261118090917_database_fk_index_rls_hardening` and `20261118091705_encapsulate_org_admin_definer_rpcs` were applied and verified:

- 149 foreign-key constraints were audited; all 95 previously uncovered foreign keys now have leading-column supporting indexes. A repeat audit reports **0 uncovered foreign keys**.
- All 62 public tables still have RLS enabled; no public table was left without RLS.
- The two server-only platform integration tables now have explicit restrictive deny policies for browser roles.
- Three RLS initialization-plan warnings were resolved by evaluating `auth.uid()` through a scalar subquery.
- Four duplicate permissive-policy overlaps were removed by splitting write permissions from read permissions. The previous read/write authorization semantics were preserved, and the repeat audit reports zero duplicate permissive-policy groups.
- No business rows were deleted or rewritten.
- Supabase now reports 113 unused indexes. This is not a reason to drop them blindly: the database is very small, usage statistics are newly initialized, and many of the new indexes exist specifically to support foreign-key maintenance. Review again after real workload and query-statistics accumulation.

### Privileged function review

The seven public organization-administration RPCs have been encapsulated by migration `20261118091705_encapsulate_org_admin_definer_rpcs`. Their public PostgREST names and arguments remain unchanged, but the public wrappers are `SECURITY INVOKER`; the privileged bodies are stored in the non-exposed `private` schema:

- Public wrappers and the seven private implementations all have an empty fixed search path.
- The private implementations deny unauthenticated callers and check the caller's active organization Super Admin membership, except the boolean helper which returns only the caller's own membership status.
- Granting a Super Admin role requires AAL2.
- Inviting a Super Admin is independently checked by a database trigger requiring AAL2.
- Last-active-Super-Admin safeguards and audit logging are present on role/member changes.
- No `anon` or `PUBLIC` execute grant exists on the public RPCs or the new private implementations.
- A live SQL smoke test under the `authenticated` role confirmed the public helper returns false for a non-member and unauthorized role assignment is rejected.

There are now 33 `SECURITY DEFINER` functions in the non-exposed `private` schema (26 pre-existing implementations/helpers plus the seven encapsulated organization-administration RPC bodies). Authenticated users have no `CREATE` privilege in either `public` or `private`, and `anon` has no `USAGE` on `private`. Twenty-two pre-existing private functions use the legacy fixed `public, private, pg_temp` search path; because application roles cannot create objects in either schema and `pg_temp` is last, this is not currently an attacker-controlled search-path injection path. Converting those remaining bodies to an empty search path requires a function-by-function qualification review and is tracked as a separate safe hardening pass rather than rewriting 22 production functions blindly.

## Additional private function hardening

A reviewed additive migration (`20261118142500_harden_private_definer_search_paths`) pins ten additional private `SECURITY DEFINER` functions to an empty `search_path`. Their application tables and helper functions are schema-qualified. The change is prepared in the current security PR and will be applied only after CI and merge. The remaining legacy private functions retain `pg_temp` last and run in schemas where application roles cannot create objects.

## Express compatibility server containment

The legacy Express server is not the Cloudflare production API runtime. It is now disabled unless `ENABLE_EXPRESS_COMPAT_SERVER=true` is explicitly set for local development. When explicitly enabled:

- It binds only to `127.0.0.1`; `HOST` cannot expose it on a public interface.
- A global per-process IP limiter runs before JSON parsing and static-file handling.
- JSON request bodies are strict and limited to 64 KiB.
- API responses are marked `Cache-Control: no-store`.
- The Express `X-Powered-By` header is disabled.
- The existing API-specific limiter remains in place.

A CI security-boundary check verifies the opt-in/loopback/body-limit controls and scans browser source/build artifacts for private credential markers.

## GitHub repository and CI

- Repository visibility is private.
- Pull-request CI runs migration consistency, UI invariants, TypeScript checks, Worker tests, local Worker smoke tests, production build, Cloudflare dry-run, security-boundary checks, and production dependency audit.
- Gitleaks scans full Git history; the latest scan passed.
- CodeQL analysis runs, but SARIF upload is disabled because GitHub code scanning is not enabled for this private repository.
- Dependabot is already configured for weekly npm and GitHub Actions updates.

Outstanding repository control: the current GitHub Free plan does not allow repository rulesets for this private repository. Upgrade to a plan that supports private-repository branch protection, then require pull requests and successful status checks on `main`, block force pushes/deletion, and require review before merging. Do not make the repository public just to obtain this control.

## Remaining hardening work

1. Upgrade Supabase to a plan that supports Leaked Password Protection and enable it.
2. Upgrade GitHub plan and enforce `main` branch protection and required checks.
3. Enable GitHub code-scanning alert upload when repository entitlement supports it; review CodeQL findings, not only workflow completion.
4. Consider a Cloudflare plan with the full managed WAF/OWASP ruleset if the dashboard's threat model and budget require it.
5. Review the Worker compatibility date and update it in a separate tested change.
6. Review production CSP behavior and refine the policy only if a legitimate required browser origin is identified.
7. Complete an authenticated end-to-end Sandbox seller OAuth and order-import acceptance test. A successful application-token check does not mean a seller has authorized the app; seller OAuth consent remains a separate state.
8. Maintain tested backups and a documented recovery/credential-rotation procedure.

## Change safety

No production business rows were deleted or rewritten by this hardening work. The eBay migration adds a nullable verification timestamp and replaces only the credential-save RPC signature; existing encrypted credentials are retained. The database FK/RLS migration adds supporting indexes and adjusts policies only; it does not change business data.
