# eBay Integration — Production Readiness

**Reviewed:** 2026-11-21  
**Runtime:** Cloudflare Worker multiacc-ecommerce-dashboard  
**Target:** Existing Production Supabase project and connected eBay Production seller accounts only.

## Implemented core

- OAuth authorization-code flow, one-time state, encrypted credentials/tokens, token refresh lease and immutable seller identity mapping.
- Sell Fulfillment order import with two-year date clamp, pagination, cursor/checkpoint, idempotent transactional imports and SKU exception handling.
- Inventory API inventory item/offer sync with listing snapshots and sanitized per-SKU failures.
- Scheduled sync queue with bounded attempts and Production-only new-order in-app/push notifications.
- Raw provider payloads are stored separately from normalized snapshots and remain restricted to Super Admin diagnostics.

## Production-only operating policy

No Supabase Development Branch or non-Production seller workflow is used for this milestone. New Production database migrations are explicitly named with production and identified as Production migrations in their PR. They are applied to the existing Production project and tracked in GitHub. Historical non-Production records are retained and excluded from future sync and queue claims.

## M2.1 — Orders and queue stabilization

PR #160 merged the retry classification, 30830 permanent-failure handling, separate last-attempt timestamp, one active scheduled job per seller, bounded job claims and duplicate queue coalescing.

Production migration 20261121170000_bound_marketplace_sync_queue_and_retries is present in the live migration history.

Latest read-only Production queue snapshot: 1,419 DEAD_LETTER, 6 RUNNING and 287 SUCCEEDED. The 6 RUNNING jobs must be checked against their lease expiry and Production account eligibility before recovery. The user has approved a bounded, deduplicated Production recovery run; do not bulk-drain the queue or delete historical job rows.

## PR #161 — Production eBay modules

PR #161 implements:

- **Active Listings:** Inventory API plus Trading API GetMyeBaySelling to include Seller Hub/legacy listings. Pagination resumes from a saved checkpoint in batches of 10 pages. A completed batch remains visible until the next complete batch is ready. Original listing item XML is preserved in the restricted raw-payload store.
- **Returns:** Production Post-Order Search Returns import for the last 18 months, bounded to 20 pages. Request uses the required IAF OAuth scheme, JSON content type and Post-Order marketplace IDs (EBAY_UK, EBAY_DE, EBAY_US). No seller-side mutation is called.
- **Seller Account:** Read-only seller privilege, subscription and payment/fulfillment/return business policies.
- **Analytics:** Traffic reports, seller standards profile and supported customer-service metrics. Marketplace support and date-range limits are respected.
- **Finances:** Seller funds summary, payout summary, status-specific transaction summaries, payouts and 90-day transactions. Requests use apiz.ebay.com, Ed25519 digital signatures and explicit 204 empty-result handling.

### Production migrations tracked by PR #161

- 20261121180000_production_ebay_provider_snapshots.sql
- 20261121180100_production_only_marketplace_sync.sql
- 20261121180200_production_ebay_signing_keys.sql
- 20261121180300_production_coalesce_expired_sync_jobs.sql

All four versions are already present in the live Production migration history. PR #161 reconciles the migration SQL into GitHub source control.

## OAuth consent requirements

The existing connected Production tokens have Account, Fulfillment and Inventory read-only scopes. Analytics requires sell.analytics.readonly; Finances requires sell.finances. The Worker checks the saved scopes and reports when a seller must reconnect. Existing sellers are not forcibly disconnected. The Returns read import uses the authorized seller token and the Post-Order API's documented IAF authorization header.

## Remaining release gates

1. Finish fresh typecheck, test and Cloudflare build verification for the latest PR #161 head.
2. Review and merge PR #161, then deploy the Worker to Production.
3. Verify Worker health and current Production account permissions.
4. Run the user-approved bounded queue recovery and confirm idempotent order imports.
5. Run approved read-only Production syncs for each eligible module/account.
6. Record exact provider counts, pagination continuation, missing scopes and errors. Do not infer absent values or rewrite existing finance/order data.

## Explicitly excluded

- No eBay listing creation, revision, publication or deletion.
- No return approval/decline, refund, label purchase, buyer message or received-item mutation.
- No finance transfer or payout mutation.
- No deletion of existing business records or raw provider payloads.
- No forced OAuth re-consent. Seller consent is requested only when the relevant module is used and its required scope is missing.
