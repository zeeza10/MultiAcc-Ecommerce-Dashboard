# eBay Integration — Implementation and Readiness

## Current implementation status

The fake adapter has been removed. `server/ebayAdapter.ts`, its simulated Express connect/sync routes, and the UI's simulated actions no longer exist.

Implemented in the secure integration branch:

- Real marketplace account creation for eBay UK, US, and Germany, with separate Sandbox/Production environment selection. Existing demo rows remain marked as demo and cannot be authorized or synchronized.
- Account-scoped OAuth Authorization Code Grant start endpoint protected by the `marketplace.manage` permission.
- 256-bit random OAuth state, stored only as a SHA-256 hash and bound to user, organization, account and environment.
- Ten-minute state expiry and atomic delete-on-callback to prevent replay. The callback rechecks active organization membership and effective `marketplace.manage` permission before exchanging the code.
- Server-side authorization-code exchange; authorization codes are never persisted.
- AES-256-GCM encryption of access and refresh tokens before storage, with authenticated additional data binding each ciphertext to its organization, marketplace account, and token type. Tokens are never returned to the browser or logged.
- Server-only service-role access for OAuth state, encrypted credentials and sync jobs. Browser roles have explicit deny policies and no table write grants.
- A five-minute Worker Cron for token refresh and due sync jobs; new real eBay accounts default to a five-minute polling interval, adjustable per account.
- eBay Sell Fulfillment API order retrieval with pagination and a 90-day initial lookback, then a seven-day overlap on subsequent runs.
- Organization/account-scoped SKU mapping. Only verified marketplace SKU mappings are used automatically; unmatched SKUs are imported with a review exception.
- Atomic order + line-item import through a service-role-only database function.
- Duplicate order prevention using the existing unique key on `(marketplace_account_id, external_order_id)`.
- Durable sync jobs with atomic `SKIP LOCKED` claiming, bounded retries, exponential backoff, dead-letter status, and recovery of abandoned jobs after the 15-minute lease expires.
- Sanitized integration audit events and sync-run counters.
- Per-account UI readiness; demo accounts cannot be connected or synchronized.

## Additional database hardening

- Employee permission overrides are now read-only for browser roles. All writes must go through the audited `set_org_member_permission_overrides` RPC; direct table INSERT/UPDATE/DELETE grants and the broad write policy have been removed.
- Marketplace credential, OAuth-state, event and sync-job foreign-key paths have supporting indexes.

## Not yet verified

No eBay Client ID, Client Secret, RuName, token-encryption key, or Supabase service-role secret has been configured. Therefore no real seller authorization or live API call has been performed yet.

The following need a Sandbox end-to-end test before Production is enabled:

1. Create a Sandbox developer application and RuName.
2. Add the server-only Worker Secrets listed below.
3. Create one real (non-demo) Sandbox account in MultiAcc.
4. Complete seller consent and verify encrypted token storage.
5. Fetch a real Sandbox order and confirm its line items and currency.
6. Repeat the same sync and verify the second run counts the order as a duplicate rather than creating another order.
7. Test expired/revoked refresh tokens, transient API failures, rate limits, and retry/dead-letter behavior.

Current importer limitations to address after the first Sandbox pass:

- Order status changes for already-imported orders are not yet reconciled; duplicates are skipped to protect existing business data.
- Inventory quantity/listing updates and eBay notification webhooks are not yet implemented.
- The current first import is limited to 100 pages per job; very large historical accounts need checkpointed pagination/backfill.
- The buyer shipping address is stored for fulfilment, but buyer contact email is not imported.
- Production OAuth and live order sync must remain disabled until Sandbox tests pass.

## Required Cloudflare Worker Secrets

Set these through Cloudflare Worker **Settings → Variables and Secrets** as encrypted Secrets, not in `wrangler.jsonc`, GitHub source, Vite variables, or browser storage:

- `SUPABASE_SERVICE_ROLE_KEY`
- `EBAY_SANDBOX_CLIENT_ID`
- `EBAY_SANDBOX_CLIENT_SECRET`
- `EBAY_SANDBOX_RUNAME`
- `EBAY_PRODUCTION_CLIENT_ID`
- `EBAY_PRODUCTION_CLIENT_SECRET`
- `EBAY_PRODUCTION_RUNAME`
- `EBAY_TOKEN_ENCRYPTION_KEY` — Base64 encoding of exactly 32 cryptographically random bytes.

The service-role key bypasses Supabase RLS. It must exist only as a Cloudflare Worker Secret and be used only by the trusted Worker. Never place it in frontend code or share it in chat.

The encryption key is independent of the eBay Client Secret. Keep a protected offline backup and define a key-rotation procedure before production use. Stored ciphertext includes a `v1` format marker and the database stores `encryption_key_version = v1`.

## eBay Developer Program setup

1. Open https://developer.ebay.com/join and register a separate eBay Developers Program account. This developer account is separate from the eBay seller/member account that will later grant seller-data access.
2. Use a business email address, verify it, accept the eBay API License Agreement, and submit the registration. eBay says approval can take approximately one business day.
3. After approval, open **Your Account → Application Keys**.
4. Create the Sandbox keyset first. Record the App ID (Client ID) and Cert ID (Client Secret) privately. The Dev ID is not used by this OAuth implementation.
5. Open **User Tokens** beside the application keys and configure the Sandbox RuName.
6. Set a display title and a valid privacy-policy URL for the application.
7. Set both the Auth Accepted URL and Auth Declined URL to the Cloudflare callback:
   `https://<your-worker-host>/api/v1/ebay/oauth/callback`
8. Save the RuName generated by eBay. Store that exact value as `EBAY_SANDBOX_RUNAME`; it is not the callback URL itself.
9. Repeat for Production only after Sandbox validation, using the Production Client ID, Client Secret and Production RuName separately. Sandbox and Production keysets and RuNames are distinct; verify the requested order-read scope is assigned to each keyset.

The OAuth scopes currently requested are:

- `https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly`

This is the only scope requested for the first phase because the initial live integration imports seller orders. We will request the inventory read scope only when the inventory/listing integration is implemented and tested.

## Encryption key generation

Generate the key locally on a trusted machine. For Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output directly into the Cloudflare Secret named `EBAY_TOKEN_ENCRYPTION_KEY`. Do not commit it or paste it into ChatGPT.

## Official references

- eBay Authorization and OAuth grant flows: https://developer.ebay.com/develop/guides/sell/authorization
- eBay token types: https://developer.ebay.com/api-docs/static/oauth-token-types.html
- eBay refresh-token grant: https://developer.ebay.com/api-docs/static/oauth-refresh-token-request.html
