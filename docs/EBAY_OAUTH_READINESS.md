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
