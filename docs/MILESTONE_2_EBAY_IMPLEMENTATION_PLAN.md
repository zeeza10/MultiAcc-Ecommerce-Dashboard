# Milestone 2 — eBay Production Integration Plan

**Target:** Existing Production Supabase project, Production Cloudflare Worker and connected eBay Production seller accounts.

## Existing implementation retained

- OAuth authorization-code flow, one-time state, encrypted credentials/tokens, token refresh lease and seller identity mapping.
- Sell Fulfillment order import, rolling two-year date clamp, pagination, cursor/checkpoint, idempotent transactional imports and SKU exception handling.
- Inventory API item/offer sync and listing snapshots.
- Production-only scheduled sync and new-order in-app/push notifications.
- Bounded sync queue with retry classification and duplicate-job coalescing.

## Work packages and acceptance criteria

| Work package | Implementation | Acceptance evidence |
|---|---|---|
| M2.1 Order sync stabilization | Permanent/transient retry classification, eBay 30830 non-retryable handling, separate attempt/success timestamps, one active scheduled job per seller, bounded claims and duplicate queue coalescing. | Production queue recovery is approved; complete only after each claimed job and imported order is reconciled. |
| M2.2 Active Listings | Inventory API snapshots plus Trading API GetMyeBaySelling for Seller Hub/legacy listings. Cursor-resume pagination in batches of 10 pages; stable batch IDs; original item XML preserved in restricted raw storage. | Production read-only listing sync; compare source item IDs/counts with Seller Hub. |
| M2.3 Returns | Read-only Post-Order Search Returns import for the previous 18 months, bounded to 20 pages, with a persisted offset/date-range checkpoint and completed-batch visibility. Uses IAF authorization and documented marketplace IDs. No seller-side mutation. | Production read-only import; verify return IDs, status, pagination and provider timestamps. |
| M2.4 Seller Account | Read seller privileges, subscriptions, payment, fulfillment and return business policies. | Production read-only snapshots, with account and marketplace scope verified. |
| M2.5 Analytics | Traffic reports, seller standards profile and supported customer-service metrics. | Production read-only snapshots; respect marketplace support and API date limits. |
| M2.6 Finances | Seller funds summary, payout summary, transaction summaries, payouts and transactions; official apiz.ebay.com host and Ed25519 digital signatures. | Production read-only sync after seller grants the required scope; reconcile source IDs, amounts and currencies without modifying the internal ledger. |
| M2.7 Release hardening | Tenant/role checks, pagination, rate limits, token expiry, retry policy, audit trail and responsive UI. | Production Worker health, bounded live sync and queue recovery report. |

## Production migration history

These Production migrations are already present in the live Production Supabase migration history and their SQL is tracked on main:

- `20261121180000_production_ebay_provider_snapshots.sql`
- `20261121180100_production_only_marketplace_sync.sql`
- `20261121180200_production_ebay_signing_keys.sql`
- `20261121180300_production_coalesce_expired_sync_jobs.sql`
- `20261121180400_production_extend_marketplace_sync_checkpoint_resources.sql`
- `20261121180500_production_index_ebay_provider_tenant_keys.sql`

The queue hardening migration `20261121170000_bound_marketplace_sync_queue_and_retries.sql` is also present in Production history.

## Production queue recovery

The Worker now finalizes abandoned Production sync-run rows after the 15-minute lease safety window, while preserving the run belonging to any currently valid job lease. On 2026-11-21 at 14:45:48Z, the recovery pass marked 363 abandoned run records as FAILED with `SYNC_RUN_ABANDONED`. It did not delete or rewrite business orders, listings, payouts, returns or raw provider payloads. The three currently leased Production jobs remain under observation and are not force-terminated.

## Production execution and safety

- Production eBay read-only synchronization and bounded, deduplicated queue recovery are approved.
- Only connected, non-demo Production eBay accounts are eligible for sync and queue claims.
- Queue recovery is bounded, deduplicated by seller/resource/idempotency key and rate-limited. Historical job rows are retained.
- Read-only operations are separate from seller-impacting mutations. Listing publish/revise/delete, return approve/decline, buyer messages, labels, refunds, transfers and Inventory writes are excluded.
- Preserve provider identifiers, amounts, currencies, timestamps and raw payloads exactly. Never infer missing SKU, listing ID, return ID, payout amount, buyer identity or source timestamp.
- Raw provider payloads remain server-only and accessible only to Super Admin diagnostics. Ordinary users receive normalized business data.
- Existing business orders, inventory, payouts, returns and finance records are not deleted or rewritten by these integrations.
- Analytics requires `sell.analytics.readonly`; Returns requires `sell.return.read`; Finances requires `sell.finances`. Existing tokens are not silently widened. Sellers grant additional scopes through the existing reconnect flow.

## Release order

1. Keep the current main source and Production Worker build green.
2. Verify Production Worker health and permissions.
3. Complete the approved bounded Production queue recovery and verify idempotent order import.
4. Run read-only Production syncs for Active Listings, Returns, Seller Account, Analytics and Finances where each seller has granted the required scope.
5. Report exact per-account provider counts, pagination continuation, missing scopes and errors. Do not fabricate missing data.
