# eBay OAuth setup (Sandbox first)

## Cloudflare Worker secrets

Set these on the production Worker `multiacc-ecommerce-dashboard` as **Secrets**, never as plain variables, GitHub Actions variables, Vite variables, or committed files:

- `SUPABASE_SECRET_KEY`: Supabase Dashboard → Settings → API Keys → Secret keys → the default `sb_secret_...` key. This key is server-only, bypasses RLS, and must never be sent to the browser.
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

This phase implements credential setup, seller account creation, OAuth authorization start, one-time callback validation, authorization-code exchange, encrypted token persistence, refresh-token renewal with a database lease, order import through the Sell Fulfillment API, and scheduled background sync.

After a seller completes OAuth, the five-minute scheduled Worker sweep discovers the newly connected account (which has no successful sync yet) and automatically queues its first sync. The sync imports orders and reads Inventory API inventory-item records, then calls the Inventory API Offers endpoint for each SKU and stores the raw inventory item, offer/listing details, listing status, offer-level available quantity, and inventory quantity in `marketplace_listing_snapshots`. Subsequent syncs follow the seller account's configured interval (15 minutes by default). The eBay account screen exposes the synced SKU, product title, listing status, inventory quantity, offer quantity, and price.

Important scope boundary: the Inventory API returns inventory-item records and offers managed through eBay's Inventory API model. It does not guarantee that every legacy listing created through Seller Hub/Trading API is represented. eBay's Active Inventory Report (Sell Feed API) can cover all active listings, but requires the broader `sell.inventory` OAuth scope (rather than the read-only scope currently requested) and has a provider limit of 25 report feeds per seller per 24 hours. Do not silently request that broader write-capable scope; legacy-listing coverage needs a separately approved scope/consent and feed-report implementation.

Payout/finance import, fulfilment updates, deletion-notification webhook verification, and end-to-end Sandbox testing remain separate completion gates. Do not call the whole eBay integration complete until those gates pass.
