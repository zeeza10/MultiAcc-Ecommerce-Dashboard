# eBay OAuth setup (Sandbox first)

## Cloudflare Worker secrets

Set these on the production Worker `multiacc-ecommerce-dashboard` as **Secrets**, never as plain variables, GitHub Actions variables, Vite variables, or committed files:

- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Project Settings → API Keys → the service_role secret key. This key is server-only and must never be sent to the browser.
- `EBAY_TOKEN_ENCRYPTION_KEY`: a base64-encoded 32-byte random key. Generate locally with `openssl rand -base64 32`. Keep a protected backup. The current ciphertext format is versioned `v1`; do not replace this key after credentials/tokens have been stored unless a coordinated re-encryption migration is performed.

Do not paste either value into chat, issues, commits, or logs.

The Worker already has `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as non-secret configuration. The `EBAY_PRODUCTION_OAUTH_ENABLED` switch must remain unset/false until eBay has activated the Production keyset and production deletion-notification compliance has been verified.

## Save eBay application credentials

Sign in to the app as a Super Admin and open eBay Marketplace Integration. Enter only the matching environment's:

- App ID (Client ID)
- Cert ID (Client Secret)
- OAuth-enabled RuName

The browser sends the values once over HTTPS to the authenticated Worker. The Worker encrypts each value with AES-256-GCM before storing ciphertext through the restricted service-role database RPC. The API returns only a masked Client ID and credential version.

Sandbox and Production credentials must never be mixed. Start with Sandbox.

## Configure the Sandbox RuName

In eBay Developer Portal → Application Keys → Sandbox → User Tokens, edit the OAuth-enabled RuName:

- Display Title: Oria Future
- Privacy Policy URL: a real, published HTTPS privacy policy page owned by Oria Future
- Auth Accepted URL: `https://app.oriafuture.com/api/v1/ebay/oauth/callback`
- Auth Declined URL: `https://app.oriafuture.com/api/v1/ebay/oauth/callback`

Save the RuName changes. The RuName value itself is the `redirect_uri` parameter sent to eBay; the accepted/declined URLs configured inside that RuName are where eBay returns the user and authorization code/state.

## OAuth behavior

- OAuth start requires an authenticated workspace member with `marketplace.manage`.
- Demo accounts cannot be connected. Create a real seller account entry first.
- State is generated with Web Crypto, SHA-256 hashed in the database, expires after 10 minutes, and is consumed once by the callback.
- Authorization code exchange happens only in the Worker. Codes and tokens are never returned to the browser or logged.
- Access and refresh tokens are AES-GCM encrypted before storage in `marketplace_credentials`.
- Production seller authorization remains disabled by default. Do not enable it until the Production keyset is active and the Marketplace Account Deletion/Closure notification subscription or approved opt-out is complete.

## Current implementation boundary

This phase implements credential setup, seller account creation, OAuth authorization start, one-time callback validation, authorization-code exchange, encrypted token persistence, refresh-token renewal with a database lease, and manual order import through the Sell Fulfillment API. Inventory listing/quantity synchronization, payout/finance import, fulfilment updates, scheduled/background sync, deletion-notification webhook verification, and end-to-end Sandbox testing remain separate completion gates. Do not call the whole eBay integration complete until those gates pass.
