# Platform Integration Management — Security and Operations

## Purpose
The Super Admin module stores platform-level eBay Developer credentials separately from source code and from tenant-owned Seller OAuth tokens.

## Credential flow
1. A Super Admin submits Sandbox or Production Client ID, Client Secret and RuName over HTTPS through an authenticated request.
2. The Cloudflare Worker verifies the authenticated role is exactly `SUPER_ADMIN`; tenant permission overrides cannot grant this platform-level capability.
3. The Worker encrypts each value with AES-256-GCM, a fresh random 96-bit IV, and field/environment-specific authenticated additional data.
4. Only ciphertext, a masked Client ID and version metadata are stored in `platform_integration_credentials`.
5. Browser roles have no table grants or RLS policies. Only the Worker service role can read ciphertext.
6. The browser status endpoint returns configured state and masked metadata only. Plaintext secrets are never returned.
7. A restricted SECURITY DEFINER RPC atomically writes ciphertext and a metadata-only audit event. It accepts calls only from the service role.

## Required Cloudflare Worker Secrets
- `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY`: base64-encoded 32 random bytes; separate from the Seller-token encryption key.
- `EBAY_TOKEN_ENCRYPTION_KEY`: existing key for Seller access/refresh tokens.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role key.

Never place real credentials in Git, `.env`, `.dev.vars.example`, frontend variables, build-time `VITE_*` variables, browser storage, issue comments, screenshots or logs.

## Operational safeguards
- Sandbox and Production records are separate.
- Secret fields are write-only; rotation replaces values without reading them back.
- Do not enable Production until Sandbox OAuth and order/inventory tests pass.
- Rotate eBay Client Secret and encryption keys only under a documented rotation/rewrap procedure. Do not replace an encryption key while ciphertext encrypted by the old key remains.
- Review Cloudflare account access, GitHub deployment permissions, Supabase service-role exposure, MFA and audit logs regularly.
- This design reduces exposure from repository/source-code leaks. It does not protect plaintext from a malicious Worker deployment, a compromised Cloudflare account, a compromised runtime, or a stolen Super Admin session. Protect deployment and Cloudflare account control planes with phishing-resistant MFA, least privilege, protected branches and reviewed deployments. For stronger key isolation, use an external KMS/HSM with envelope encryption.

## Validation boundary
The module stores credentials securely; it does not yet prove the eBay keyset or RuName is valid. A provider-side validation and Sandbox Seller OAuth test must be performed after credentials are entered.
