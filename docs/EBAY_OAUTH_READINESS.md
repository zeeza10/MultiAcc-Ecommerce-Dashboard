# eBay Integration — Production Readiness

**Runtime:** Cloudflare Worker `multiacc-ecommerce-dashboard`  
**Target:** Existing Production Supabase project and connected eBay Production seller accounts only.

## Implemented core

- OAuth authorization-code flow, one-time state, encrypted credentials/tokens, token refresh lease and immutable seller identity mapping.
- Sell Fulfillment order import with two-year date clamp, pagination, cursor/checkpoint, idempotent transactional imports and SKU exception handling.
- Inventory API item/offer sync with listing snapshots and sanitized per-SKU failures.
- Production-only scheduled sync and new-order in-app/push notifications.
- Bounded queue with retry classification, expired lease handling and duplicate-job coalescing.
- Restricted raw provider payload storage, separate from normalized snapshots.

## Production-only operating policy

All new syncs and queue claims are limited to connected Production seller accounts. New database migrations are explicitly named as Production migrations and tracked on main. Historical records remain preserved.

## Production eBay modules — main commit

Implemented directly on main in commit `e464f549daebd3fc09bc756aedc4ca52d4b85635`:

- **Active Listings:** Inventory API plus Trading API `GetMyeBaySelling` to include Seller Hub/legacy listings. Pagination resumes from a saved checkpoint in batches of 10 pages. Completed batches remain visible until the next complete batch is ready. Original listing item XML is preserved in restricted raw storage.
- **Returns:** Production Post-Order Search Returns import for the previous 18 months, bounded to 20 pages, with saved offset/date-range checkpoints and last-completed-batch visibility. Uses IAF authorization, correct Post-Order marketplace IDs and read-only GET requests. No seller-side mutation is called.
- **Seller Account:** Read-only seller privilege, subscription and payment/fulfillment/return business policies.
- **Analytics:** Traffic reports, seller standards profile and supported customer-service metrics.
- **Finances:** Seller funds summary, payout summary, transaction summaries, payouts and transactions. Requests use `apiz.ebay.com`, Ed25519 digital signatures and explicit 204 empty-result handling.

## Production migrations tracked on main

- `20261121180000_production_ebay_provider_snapshots.sql`
- `20261121180100_production_only_marketplace_sync.sql`
- `20261121180200_production_ebay_signing_keys.sql`
- `20261121180300_production_coalesce_expired_sync_jobs.sql`
- `20261121180400_production_extend_marketplace_sync_checkpoint_resources.sql`

All five versions are present in the live Production migration history. The main branch tracks each SQL file, including the checkpoint-resource extension.

## OAuth consent requirements

- Existing connected Production tokens contain Account, Fulfillment and Inventory read-only scopes.
- Analytics requires `sell.analytics.readonly`.
- Returns requires `sell.return.read`.
- Finances requires `sell.finances`.
- The Worker checks saved scopes and reports when a seller must reconnect. Existing sellers are not forcibly disconnected and existing grants are not silently widened.
- Returns read import uses the seller user token with the Post-Order API's documented IAF authorization header.

## Production queue recovery

The Worker now finalizes abandoned Production sync-run rows after the 15-minute lease safety window, while preserving any run protected by a current valid job lease. The 2026-11-21 14:45:48Z recovery pass marked 363 abandoned run records as FAILED with `SYNC_RUN_ABANDONED`. No business records or raw provider payloads were deleted or rewritten. Three currently leased Production jobs remain under observation.

## Build and deployment evidence

Main commit `e464f549daebd3fc09bc756aedc4ca52d4b85635` passed TypeScript validation, 107 tests and the Vite production build. The latest Cloudflare Production deployment completed at `2026-11-21T14:45:51Z`, Worker version `76e8e8e9-c40e-4121-9bbb-633b943e800e`. It includes signing-key PEM newline handling, Production-only scheduling, bounded order/inventory pages and abandoned-run recovery.

## Remaining release gates

1. Verify the latest main build and Production deployment after signing-key PEM hardening.
2. Complete the approved bounded Production queue recovery; reconcile stalled sync runs and job outcomes.
3. Run read-only Production syncs for each eligible module/account.
4. Record exact provider counts, pagination continuation, missing scopes and errors. Do not infer absent values or rewrite existing order/finance data.

## Explicitly excluded

- No listing creation, revision, publication or deletion.
- No return approval/decline, refund, label purchase, buyer message or received-item mutation.
- No finance transfer or payout mutation.
- No deletion of existing business records or raw provider payloads.
- No forced OAuth re-consent.
