# MultiAcc security hardening baseline

Audit date: 2026-11-18

This document records verified controls and outstanding platform-level work. It is not a claim that the application is impossible to compromise.

## Cloudflare edge

The following rules are active and scoped only to `app.oriafuture.com` so unrelated mail, cPanel, and other zone hostnames are not changed:

- Cloudflare Managed Free Ruleset is executed for the dashboard hostname.
- TLS 1.0 and TLS 1.1 connections are blocked for the dashboard hostname.
- HTTP requests are redirected to HTTPS while preserving the original path and query.
- The Worker emits HSTS on HTTPS responses, plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive Permissions Policy.
- API responses use `Cache-Control: no-store`.
- Worker rate limits are configured for IP traffic, reads, writes, and invitations.

Cloudflare's legacy zone `waf` setting is deprecated; Managed Rulesets are activated through the Rulesets phase entrypoint. The app-specific managed-ruleset rule is therefore the active control. No zone-wide minimum-TLS or Always-HTTPS setting was changed because this DNS zone also contains mail and cPanel hostnames.

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
- The seven organization access `SECURITY DEFINER` functions callable by `authenticated` have a fixed empty search path and enforce the caller's active organization Super Admin membership; Super Admin role assignment/invitation is protected by AAL2 checks.
- The eBay credential-save RPC is service-role-only. The legacy RPC signature has been removed and the new signature requires a recent server verification timestamp.
- Existing eBay app credentials remain encrypted but are intentionally marked unverified until replaced through the eBay verification flow.

Outstanding Auth item: Supabase Leaked Password Protection is disabled. The current Supabase organization is on the Free plan; Supabase documents this feature as available on Pro and above. Enable it after upgrading the project/organization to a supporting plan. Do not weaken other Auth controls to compensate.

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
4. Review the Worker compatibility date and update it in a separate tested change.
5. Add a Content Security Policy in report-only mode, inventorying all legitimate browser connections first, then enforce it after testing.
6. Run an authenticated end-to-end Sandbox eBay test using valid credentials entered only in the dashboard. A successful application-token check does not mean a seller has authorized the app; seller OAuth consent remains a separate state.
7. Maintain tested backups and a documented recovery/credential-rotation procedure.

## Change safety

No production business rows were deleted or rewritten by this hardening work. The eBay migration adds a nullable verification timestamp and replaces only the credential-save RPC signature; existing encrypted credentials are retained.
