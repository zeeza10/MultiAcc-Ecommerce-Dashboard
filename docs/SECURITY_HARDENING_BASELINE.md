# MultiAcc security hardening baseline

Audit date: 2026-11-18

This document records verified controls and outstanding platform-level work. It is not a claim that the application is impossible to compromise.

## Cloudflare edge

The following rules are active and scoped only to `app.oriafuture.com` so unrelated mail, cPanel, and other zone hostnames are not changed:

- Cloudflare Managed Free Ruleset is executed for the dashboard hostname.
- TLS 1.0 and TLS 1.1 connections are blocked for the dashboard hostname.
- HTTP requests are redirected to HTTPS while preserving the original path and query.
- The Worker emits HSTS and an enforced restrictive Content Security Policy on HTTPS responses, plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive Permissions Policy. Inline scripts and inline style blocks are not allowed; the PDF report stylesheet is served from the same origin.
- API responses use `Cache-Control: no-store`.
- Worker rate limits are configured for IP traffic, reads, writes, and invitations.

Cloudflare's legacy zone `waf` setting is deprecated; Managed Rulesets are activated through the Rulesets phase entrypoint. The app-specific Managed Free Ruleset rule is therefore the active control. The zone is currently on Cloudflare's Free Website plan, so this is not equivalent to the full paid managed WAF/OWASP feature set. No zone-wide minimum-TLS or Always-HTTPS setting was changed because this DNS zone also contains mail and cPanel hostnames.

## Cloudflare Worker secrets

Verified binding types:

- `SUPABASE_SECRET_KEY`: `secret_text`
- `EBAY_TOKEN_ENCRYPTION_KEY`: `secret_text`
- `PLATFORM_SUPER_ADMIN_USER_IDS`: `secret_text`
- `SUPABASE_PUBLISHABLE_KEY`: `plain_text` (intended for public clients)

Private keys and tokens must never be placed in `wrangler.jsonc`, Vite variables, browser bundles, GitHub source, or logs.

## Supabase database and Auth

Verified against the Production project:

- All 62 tables in the exposed `public` schema have RLS enabled.
- The `anon` role has zero direct table grants in `public`.
- The `platform_integration_credentials` and `platform_integration_audit` tables have RLS enabled, no client policies, and are granted only to `service_role` as intended for server-only data.
- No public views or Storage buckets currently exist.
- All 62 public tables have RLS enabled; no RLS-enabled public table was found without a policy. Server-only marketplace credential/state/job/audit tables explicitly deny browser roles and are granted only to `service_role`.
- All 149 public foreign keys have valid supporting indexes. No duplicate index definitions were found. The performance advisor reports 113 currently unused indexes; these are retained pending workload/query-plan evidence rather than removed blindly.
- The seven organization-admin public RPCs are `SECURITY INVOKER` wrappers; their privileged implementations live in the non-exposed `private` schema. `anon` has no execute grant. Ten additional private `SECURITY DEFINER` functions are scheduled to receive an empty search path through the pending hardening migration; existing table/helper references are schema-qualified.
- The eBay credential-save RPC is service-role-only. The legacy RPC signature has been removed and the new signature requires a recent server verification timestamp.
- eBay application Client ID, Client Secret and RuName are stored as AES-GCM ciphertext; seller access/refresh tokens are also ciphertext. The current Sandbox application keypair has a successful eBay verification timestamp. Seller OAuth authorization remains a separate per-account state; Production application credentials are not configured.

Outstanding Auth item: Supabase Leaked Password Protection is disabled. The current Supabase organization is on the Free plan; Supabase documents this feature as available on Pro and above. Enable it after upgrading the project/organization to a supporting plan. Do not weaken other Auth controls to compensate.

## Legacy compatibility server

- The Express compatibility server is not part of the Cloudflare Worker production entry point.
- Its entry point now fails closed unless `ENABLE_LEGACY_EXPRESS_SERVER=true` is explicitly set for local troubleshooting.
- It rejects non-loopback bind addresses and cannot listen on a public network interface.

## GitHub repository and CI

- Repository visibility is private.
- Pull-request CI runs migration consistency, UI invariants, TypeScript checks, Worker tests, local Worker smoke tests, production build, Cloudflare dry-run, and production dependency audit.
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
6. Review CSP violation reports/real browser behavior after deployment and refine the enforced policy only when a legitimate required origin is identified.
7. Complete an authenticated end-to-end Sandbox seller OAuth and order-import acceptance test. A successful application-token check does not mean a seller has authorized the app; seller OAuth consent remains a separate state.
8. Maintain tested backups and a documented recovery/credential-rotation procedure.

## Change safety

No production business rows were deleted or rewritten by this hardening work. The eBay migration adds a nullable verification timestamp and replaces only the credential-save RPC signature; existing encrypted credentials are retained.
