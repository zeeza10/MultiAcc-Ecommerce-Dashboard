# eBay OAuth Integration Readiness

## Current verified state

- The legacy `server/ebayAdapter.ts` is a simulation, not a real eBay integration. Its `connect()` method marks an account connected and invents a 30-day expiry; its order sync uses hard-coded sample orders.
- The Cloudflare Worker currently exposes safe read-only marketplace account metadata and sync history. OAuth connect, token refresh and order sync remain intentionally unavailable (501) until a real implementation is ready.
- The current Cloudflare Worker settings were inspected without reading or exposing secret values. Only `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `ASSETS` bindings were present. No eBay OAuth credentials or token-encryption key are configured.

## Required credentials and bindings

Configure these as Cloudflare Worker **Secrets**, not plain-text variables and never in GitHub source or Vite/browser environment variables:

- Sandbox eBay Client ID
- Sandbox eBay Client Secret
- Sandbox RuName / redirect URI identifier
- Production eBay Client ID
- Production eBay Client Secret
- Production RuName / redirect URI identifier
- A strong token-encryption key with a documented key version and rotation plan

The exact binding names will be finalized in the OAuth implementation. Keep Sandbox and Production credentials separate. Do not paste client secrets or seller tokens into chat or commit them to the repository.

## Required implementation sequence

1. Create an account-scoped OAuth start endpoint that checks `marketplace.manage`, validates the account's environment and generates a cryptographically random, one-time state value.
2. Store OAuth state server-side with a short expiry and bind it to the authenticated user, organization, marketplace account and environment. A callback must reject missing, expired, reused or mismatched state.
3. Redirect the seller to eBay's consent page with the exact configured RuName and least-privilege scopes.
4. Handle the callback without trusting browser-supplied organization/account identifiers; resolve them only from the stored one-time state.
5. Exchange the one-time authorization code server-side. Never persist the authorization code.
6. Encrypt access and refresh tokens before storing them in `marketplace_credentials`; store key version, scopes and token expiry. Never return token values to the browser or logs.
7. Implement refresh-token rotation and revoked-token handling. Mark the marketplace account as expired/disconnected and require fresh consent if eBay revokes the refresh token.
8. Add real eBay Sell Fulfillment API order sync with pagination, idempotency, SKU exception handling, sync-run records, retry limits and audit events. Remove simulated adapter behavior only after parity tests pass.

## Security and operational rules

- Use the Authorization Code Grant for seller-owned data. Application/client-credentials tokens are not a substitute for seller consent.
- Validate OAuth `state` to mitigate CSRF.
- Keep tokens and client secrets server-side only. Redact authorization codes, tokens and sensitive buyer data from logs.
- Use the correct Sandbox or Production OAuth and API endpoints for each account; never mix environment tokens.
- Do not mark an account CONNECTED until eBay returns valid token material and the token has been encrypted and persisted successfully.
- Do not start production seller authorization until Sandbox flow and order import have passed end-to-end tests.

## Official references

- eBay Authorization and OAuth grant flows: https://developer.ebay.com/develop/guides/sell/authorization
- eBay OAuth credentials and environment separation: https://developer.ebay.com/api-docs/static/oauth-credentials.html
- eBay OAuth token types: https://developer.ebay.com/api-docs/static/oauth-token-types.html


## Implemented secure foundation (no live credentials required yet)

- The legacy simulated adapter and its Express connect/sync routes have been removed. The UI no longer presents mock connect or sync actions.
- OAuth start is account-scoped and requires `marketplace.manage`. It refuses demo accounts and validates that the account belongs to the caller's active organization.
- OAuth state is generated from 256 bits of cryptographic randomness, stored only as a SHA-256 hash, bound to the user, organization, account and environment, and expires after ten minutes. The callback atomically deletes the state row before exchanging the code, preventing replay.
- The callback exchanges the one-time code server-side, encrypts both tokens using AES-256-GCM, and only then marks the account connected. Tokens and authorization codes are never returned to the browser or written to logs.
- A Worker Cron runs every 15 minutes and refreshes access tokens nearing expiry. Invalid/revoked refresh tokens mark the account as requiring renewed authorization.
- Server-only credentials, OAuth state, and sync job tables are not exposed to browser roles. Sanitized integration events are visible only to users with marketplace view permission.
- eBay credentials and the 32-byte token-encryption key are intentionally not configured. The secure flow remains unavailable until these are supplied as Cloudflare Worker Secrets.

## Required Cloudflare Worker Secrets (do not put these in wrangler.jsonc vars)

- `SUPABASE_SERVICE_ROLE_KEY`
- `EBAY_SANDBOX_CLIENT_ID`
- `EBAY_SANDBOX_CLIENT_SECRET`
- `EBAY_SANDBOX_RUNAME`
- `EBAY_PRODUCTION_CLIENT_ID`
- `EBAY_PRODUCTION_CLIENT_SECRET`
- `EBAY_PRODUCTION_RUNAME`
- `EBAY_TOKEN_ENCRYPTION_KEY` (base64 encoding of exactly 32 random bytes)

The eBay RuName's Auth Accepted URL must point to `https://<your-worker-host>/api/v1/ebay/oauth/callback`. Configure the Auth Declined URL to the same callback path so the state can be consumed and the declined grant recorded. The eBay developer portal creates the RuName; it is not an arbitrary URL.

## Remaining before live order import

- Implement and test the real Sell Fulfillment API importer, pagination, line-item mapping, database transaction and unique-key idempotency.
- Add the user-facing real marketplace account creation/selection flow (current three rows are demo records and cannot be authorized).
- Add a durable sync-job worker, bounded retries, dead-letter handling and automated polling/webhook ingestion.
- Configure Sandbox app credentials and run a full seller-consent + order-import test before Production.
