# eBay environments — MultiAcc Dashboard

## Credential management model

The eBay Developer App credentials are platform-level credentials shared by this application. They are not Seller tokens and are not tenant-owned. Configure them in the Dashboard:

**Super Admin → Integrations & API Management → eBay**

The page has separate Sandbox and Production keysets. App ID, Cert ID and RuName are write-only. The browser never receives saved plaintext values. The Worker encrypts each field before it reaches the database and records a metadata-only audit event atomically with the update.

## eBay Developer Portal values

For each environment, obtain the matching values from Developer Portal → Application Keys:

| eBay value | Dashboard field |
|---|---|
| Sandbox App ID | Sandbox App ID / Client ID |
| Sandbox Cert ID | Sandbox Cert ID / Client Secret |
| Sandbox OAuth RuName | Sandbox OAuth RuName |
| Production App ID | Production App ID / Client ID |
| Production Cert ID | Production Cert ID / Client Secret |
| Production OAuth RuName | Production OAuth RuName |

Dev ID is not used by the current OAuth authorization-code flow. Do not confuse the RuName identifier with the callback URL text.

## Cloudflare Worker Secrets

The Dashboard vault requires these server-side secrets:

| Secret name | Purpose |
|---|---|
| `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` | Base64 encoding of exactly 32 random bytes; encrypts platform App ID, Cert ID and RuName |
| `EBAY_TOKEN_ENCRYPTION_KEY` | Separate Base64 32-byte key for each Seller's access and refresh tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker-only access to protected credential tables and background jobs |

Set them in Cloudflare Dashboard → Workers & Pages → `multiacc-ecommerce-dashboard` → Settings → Variables and Secrets. Add them as **Secrets**, not plaintext variables. Never commit real values or place them in `wrangler.jsonc`, Vite variables, browser storage, GitHub, logs or chat.

For local Wrangler development, use a local `.dev.vars` file copied from `.dev.vars.example`; never commit `.dev.vars`. The platform credential vault still needs the encryption key and service-role key available to the local Worker.

The non-secret `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` remain configured in `wrangler.jsonc`.

## OAuth callback and scopes

The callback route is:

`https://<your-dashboard-worker-host>/api/v1/ebay/oauth/callback`

Configure the eBay OAuth-enabled RuName so its accepted URL points to the correct deployed callback URL for the corresponding environment. The app sends the generated RuName as the OAuth `redirect_uri`.

Current user-consent scopes are read-only:

- `https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly` — seller orders / fulfillment data.
- `https://api.ebay.com/oauth/api_scope/sell.inventory.readonly` — seller inventory and SKU data.

Do not request write scopes until the application implements and needs those write operations.

## API endpoints

| Operation | Sandbox | Production |
|---|---|---|
| Seller authorization | `https://auth.sandbox.ebay.com/oauth2/authorize` | `https://auth.ebay.com/oauth2/authorize` |
| Token exchange / refresh | `https://api.sandbox.ebay.com/identity/v1/oauth2/token` | `https://api.ebay.com/identity/v1/oauth2/token` |
| Sell REST APIs | `https://api.sandbox.ebay.com` | `https://api.ebay.com` |

## Safe activation sequence

1. Wait for eBay Developer Account/keyset review and confirm the correct Sandbox keyset.
2. Configure the three required Cloudflare Worker Secrets listed above. Generate independent encryption keys for platform credentials and Seller tokens.
3. In the Dashboard, open Super Admin → Integrations & API Management, choose Sandbox, and enter the Sandbox App ID, Cert ID and RuName.
4. Verify the eBay OAuth-enabled RuName accepted URL and scope grants.
5. Create a non-demo eBay Sandbox Seller account and initiate Seller OAuth from the eBay Accounts module.
6. Verify token encryption, refresh, orders, inventory/SKU mapping, duplicate protection, rate limits and audit behavior.
7. Configure Production separately only after eBay approval and successful Sandbox validation.

## Security boundaries

- Platform credentials are encrypted using AES-256-GCM with fresh random nonces and field/environment-bound authenticated additional data.
- The database credential tables have RLS enabled and forced, no browser-role grants, and no browser policies. Only the Worker service role reads ciphertext.
- Credential writes and metadata-only audit events are performed atomically by a restricted service-role-only database function.
- The status API returns only a masked Client ID and metadata. It never returns plaintext secrets.
- Seller access and refresh tokens remain separately encrypted and bound to organization/account/token type.

Encryption protects stored values and reduces risk from repository/source-code disclosure. It does not protect against a malicious Worker deployment, compromised Cloudflare account, compromised Worker runtime, stolen Super Admin session or stolen service-role key. Protect Cloudflare, GitHub and Supabase control planes with phishing-resistant MFA, least privilege, protected branches and reviewed deployments. For stronger separation from runtime compromise, use an external KMS/HSM with envelope encryption.

The Dashboard credential page currently stores and rotates credentials; saving alone does not prove the eBay keyset is valid. A real Sandbox Seller OAuth test and provider API verification are still required before calling the integration ready.

## One-time platform-owner setup
Configure `PLATFORM_SUPER_ADMIN_USER_IDS` as a Cloudflare Worker Secret containing the platform owner's Supabase Auth UUID (the matching `profiles.id`). This is intentionally separate from an organization-level Super Admin role so tenant administrators cannot rotate application-wide eBay credentials. Credential writes require an AAL2 MFA session. See `docs/security/PLATFORM_INTEGRATION_CREDENTIALS.md` for the Windows key-generation command and security details.
