# eBay environments — MultiAcc Dashboard

This project keeps eBay Sandbox and Production credentials separate. OAuth credentials are read only by the Cloudflare Worker; they must never be placed in Vite variables, browser code, GitHub commits, or Supabase client-side configuration.

## Where the environment lives

1. **Local development template:** repository root, `.dev.vars.example`. Copy it to `.dev.vars` for local Wrangler use. The real `.dev.vars` file is local-only and must never be committed.
2. **Cloudflare runtime (recommended for deployed testing):** Cloudflare Dashboard → Workers & Pages → `multiacc-ecommerce-dashboard` → Settings → Variables and Secrets. Add the values below as **Secrets**, not plain-text variables. Add them to the correct Worker deployment environment. Do not put secrets in `wrangler.jsonc`.
3. **Code configuration:** `worker/ebay/oauth.ts` selects the Sandbox or Production keyset from the marketplace account's `environment` field. Sandbox and Production endpoints are selected by the Worker; they are not interchangeable.

## Required Worker Secrets

| Secret name | eBay portal value / purpose | Needed |
|---|---|---|
| `EBAY_SANDBOX_CLIENT_ID` | Sandbox App ID (Client ID) | Sandbox |
| `EBAY_SANDBOX_CLIENT_SECRET` | Sandbox Cert ID (Client Secret) | Sandbox |
| `EBAY_SANDBOX_RUNAME` | Sandbox OAuth-enabled RuName (not the accepted URL) | Sandbox |
| `EBAY_PRODUCTION_CLIENT_ID` | Production App ID (Client ID) | When approved for live use |
| `EBAY_PRODUCTION_CLIENT_SECRET` | Production Cert ID (Client Secret) | When approved for live use |
| `EBAY_PRODUCTION_RUNAME` | Production OAuth-enabled RuName | When approved for live use |
| `EBAY_TOKEN_ENCRYPTION_KEY` | Base64-encoded 32-byte AES-GCM key used to encrypt seller tokens in Supabase | Required for OAuth |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key; server-side only | Required for OAuth/background jobs |

The existing non-secret `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are configured in `wrangler.jsonc`. Do not copy the service-role key into that file.

## eBay Developer Portal checklist

Open Developer Portal → Your Account → Application Keys → select the relevant keyset:

- Copy **App ID** into the matching `*_CLIENT_ID` secret.
- Copy **Cert ID** into the matching `*_CLIENT_SECRET` secret.
- Do not confuse **Dev ID** with OAuth Client ID. Dev ID is not currently consumed by this OAuth flow.
- Open **User Tokens** and configure an OAuth-enabled Redirect URL/RuName. Copy the generated **RuName** into the matching `*_RUNAME` secret. The OAuth request uses this RuName as `redirect_uri`; it is not the callback URL text itself.
- Ensure the Sandbox keyset has the required scopes enabled. Sandbox and Production keysets can have different scope grants.

## Current application permissions

The authorization request currently asks for read-only access to:

- `https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly` — read seller orders/fulfillment data for order import.
- `https://api.ebay.com/oauth/api_scope/sell.inventory.readonly` — read seller inventory/SKU records for inventory matching and reconciliation.

These are user-consent scopes. If the Developer Portal keyset does not show the required scopes, the seller authorization cannot grant them; check the keyset's OAuth scope list before testing. Do not request write scopes until the product explicitly implements and needs write operations.

## Environment endpoints

| Operation | Sandbox | Production |
|---|---|---|
| Seller authorization | `https://auth.sandbox.ebay.com/oauth2/authorize` | `https://auth.ebay.com/oauth2/authorize` |
| OAuth token exchange/refresh | `https://api.sandbox.ebay.com/identity/v1/oauth2/token` | `https://api.ebay.com/identity/v1/oauth2/token` |
| Sell REST APIs | `https://api.sandbox.ebay.com` | `https://api.ebay.com` |

## Safe setup order

1. Wait for the Developer Account/keyset review to finish. No need to enter credentials into the repository.
2. Create/confirm the Sandbox keyset and its OAuth-enabled RuName.
3. Add the three Sandbox eBay values as Worker Secrets, plus the existing server-side encryption and Supabase service-role secrets if not already configured. Secret values should be entered directly in Cloudflare, never sent in chat.
4. Create a non-demo Sandbox seller account in eBay Sandbox and authorize that seller from a Sandbox marketplace account in MultiAcc.
5. Verify order import, inventory/SKU read access, duplicate-order protection, and concurrent token refresh before enabling Production.
6. Add Production credentials only after approval and explicit production readiness. Keep Production seller accounts and tokens isolated from Sandbox.

## Important

- The Developer Account review status is separate from the local code environment. Creating this configuration does not bypass eBay review or activate API access.
- Do not expose Client Secret, access tokens, refresh tokens, service-role key, or encryption key in frontend code, logs, screenshots, GitHub, or chat.
- Never test Production using Sandbox credentials or Sandbox seller accounts.
