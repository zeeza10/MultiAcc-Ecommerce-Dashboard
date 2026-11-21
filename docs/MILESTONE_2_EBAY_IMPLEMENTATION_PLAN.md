# Milestone 2 — eBay Production Integration Plan

**Baseline:** main + Milestone 1 audit closure, 2026-11-21  
**Target:** Existing Production Supabase project, Production Cloudflare Worker and the real connected eBay Production seller accounts.  
**No separate Supabase Development Branch is used. No non-Production seller workflow is part of this milestone.**

## Existing implementation — retain and harden

- OAuth authorization-code flow, one-time state, encrypted credentials/tokens, token refresh lease and seller identity mapping.
- Sell Fulfillment order import, two-year date clamp, cursor/checkpoint, idempotency and SKU exception handling.
- Inventory API item/offer sync and listing snapshots.
- Scheduled sync job leasing and Production-only new-order notifications.

## Work packages and acceptance criteria

| Work package | Implementation | Acceptance evidence |
|---|---|---|
| M2.1 Order sync stabilization | **Implemented in PR #160.** Permanent/transient retry classification, no automatic retry for eBay 30830, separate attempt/success timestamps, one active scheduled job per seller, bounded claims and duplicate-job coalescing. Production migration 20261121170000 is present in live migration history. | PR #160 merged; 86 tests passed on its verified Preview head. Production queue recovery is approved and will be run as a bounded, deduplicated operation after the current Worker release is verified. |
| M2.2 Active Listings | **Implemented in PR #161.** Combine Inventory API listings with Trading API GetMyeBaySelling for Seller Hub/legacy listings. Cursor-resume pagination in batches of 10 pages, stable batch IDs, and raw item XML preservation. | Latest PR build; Production read-only listing sync; compare provider counts and item IDs against Seller Hub. |
| M2.3 Returns | **Implemented in PR #161.** Read-only import from the Production Post-Order Search Returns endpoint, last 18 months, up to 20 pages. Uses IAF authorization and correct Post-Order marketplace IDs. No seller-side mutation. | Latest PR build; Production read-only import; verify source return IDs, status and pagination. |
| M2.4 Seller Account | **Implemented in PR #161.** Read seller privileges, subscriptions, payment, fulfillment and return policies. | Latest PR build; Production read-only sync; verify provider snapshot timestamps and marketplace/account scope. |
| M2.5 Analytics | **Implemented in PR #161.** Traffic report, seller standards profile and supported customer-service metrics. | Latest PR build; Production read-only sync; respect marketplace support and API date limits. |
| M2.6 Finances | **Implemented in PR #161.** Seller funds, payout summaries, status-specific transaction summaries, payouts and 90-day transactions; official apiz.ebay.com host and Ed25519 digital signatures. | Latest PR build; Production read-only sync after the required seller scope is granted; reconcile provider amounts/currencies and source IDs without modifying the internal ledger. |
| M2.7 Release hardening | Tenant/role checks, pagination, rate limits, token expiry, retry policy, audit trail and responsive UI. | Latest Preview build; Production deployment health; bounded live read-only sync and queue recovery report. |

## Production migration history

The following Production-labelled migrations are already present in the live Production Supabase migration history and are tracked by PR #161:

- 20261121180000_production_ebay_provider_snapshots.sql
- 20261121180100_production_only_marketplace_sync.sql
- 20261121180200_production_ebay_signing_keys.sql
- 20261121180300_production_coalesce_expired_sync_jobs.sql

The earlier M2.1 queue migration 20261121170000_bound_marketplace_sync_queue_and_retries.sql is also present in Production history.

## Production execution and safety

- The user has approved Production eBay read-only synchronization and bounded queue recovery.
- Execute only against connected, non-demo Production eBay accounts. Ignore all non-Production accounts and preserve their historical records.
- Queue recovery must remain bounded, deduplicated by seller/resource/idempotency key, and rate-limited. Do not delete historical job rows.
- Keep read-only operations separate from seller-impacting mutations. No listing publish/revise/delete, return approve/decline, buyer message, label, refund, transfer or Inventory write is included in this approval.
- Preserve provider identifiers, amounts, currencies, timestamps and raw payloads exactly. Never infer missing SKU, listing ID, return ID, payout amount, buyer identity or source timestamp.
- Raw provider payloads remain server-only and accessible only to Super Admin diagnostics. Ordinary users receive normalized business data.
- Existing business orders, inventory, payouts, returns and finance records must not be deleted or rewritten by these integrations.
- Additional OAuth scopes for Analytics and Finances must be granted by the seller through the existing reconnect flow; do not silently expand an already-consented token.

## Release order

1. Complete the latest PR #161 verification build and tests.
2. Merge the reviewed PR and deploy the Worker to Production after confirming the four Production migrations are present in the live migration history.
3. Verify Production Worker health and permissions.
4. Run the approved bounded Production queue recovery, then verify job outcomes and idempotent order import.
5. Run read-only Production syncs for Active Listings, Returns, Seller Account, Analytics and Finances, only where the required seller scope is already granted.
6. Report per-account results, partial pages, missing scopes and provider errors. Do not fabricate missing data.
