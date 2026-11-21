# eBay Integration — Current Readiness and Remaining Work

**Reviewed:** 2026-11-21
**Runtime:** Cloudflare Worker multiacc-ecommerce-dashboard
**Status:** Core OAuth and read-only order/inventory synchronization are implemented in the Worker. The integration is not feature-complete across the full eBay seller lifecycle.

## Implemented in the Worker

- Platform-managed SANDBOX and PRODUCTION application credentials are stored encrypted in Supabase; only masked client IDs and verification metadata are exposed to the UI.
- Account-scoped OAuth start route checks marketplace.manage, binds a random one-time state to user, organization, account and environment, and expires it after ten minutes.
- OAuth callback consumes the state once, exchanges the code server-side, captures the seller's immutable eBay user ID, encrypts access/refresh tokens, and persists token expiry/scopes.
- Token refresh uses a database lease to prevent concurrent refreshes, rotates refresh tokens when eBay returns a replacement, and disconnects revoked/expired authorizations.
- Real Sell Fulfillment order sync uses pagination, a saved cursor/watermark, a rolling two-year start-date clamp, idempotent transactional imports, SKU exception handling, sync-run/checkpoint records, and Production-only new-order in-app/push notifications.
- Real Inventory API sync reads inventory items and offers and stores listing snapshots and sanitized per-SKU failures.
- Scheduled sync excludes demo accounts and uses a leased, idempotent job queue with bounded attempts.
- Raw provider payload access remains restricted to Super Admin; ordinary users receive normalized business data.

## Production-only implementation policy

The active integration is Production only. No Supabase Development Branch or test/sandbox seller account is required. New Production database migrations are labelled `PRODUCTION` in their filename and PR description, reviewed in GitHub, then applied to the existing Production project. Existing historical non-Production records are retained but excluded from future synchronization and queue claims.

## Milestone 2.1 implementation in progress

PR #160 adds permanent/transient failure classification (including no automatic retry for eBay 30830), a separate last-attempt timestamp, an atomic per-account scheduled enqueue RPC, queue coalescing that preserves old job rows as DEAD_LETTER audit records, and one-job-per-account claim selection. It also treats fully imported orders with SKU mapping exceptions as completed sync work rather than retrying them. The Production migration `20261121170000_bound_marketplace_sync_queue_and_retries` is now present in the live Production migration history. The follow-on Production-only queue migration and provider-snapshot migration are in the current implementation PR and must be applied before the new Worker version is deployed.

## Important limitations / not yet complete

1. **Active Listings coverage:** Current listing snapshots are based on Inventory API inventory items/offers. eBay documents that Inventory API does not return listings created through Seller Hub or Trading API unless they are migrated into the Inventory API model. A separate compatibility/read path is required for complete Active Listings coverage; no listing create/revise/publish/delete scope is included in this milestone without approval.
2. **Returns:** The current /returns module is an internal returns/disposition workflow. It is not yet a complete eBay Return API integration for seller return requests, messages, labels, approvals/declines, received items, and refunds.
3. **Seller Account:** OAuth captures seller identity and current account metadata, but full seller account settings, selling limits, business policies, payment/fulfilment/return policies, and seller status views still need API coverage.
4. **Analytics:** Current dashboard/report data is derived from internal orders, inventory and finance tables. eBay Analytics API traffic reports, seller standards profiles, and customer-service metrics are not yet integrated.
5. **Finances:** Current finance and payout views use internal finance/payout records. eBay Finances API payout, transaction, fee, refund, transfer, and seller-funds data have not yet been imported and reconciled as provider-sourced records.
6. **Production queue recovery:** Production snapshot showed 1,027 order-sync failure events, 647 dead-letter jobs, 692 queued jobs, and 19 running jobs. The dominant historical order error was eBay 30830 (start date outside the two-year window); Historical inventory failures also recorded the offerResults is not defined bug fixed in PR #159. Do not bulk retry or drain these jobs until the fix is deployed and a deduplicated, bounded recovery plan is approved.

## Milestone 2 implementation order

1. Verify the Production Worker version after PR #159 merge; the latest deployment was created shortly after the merge, but the deployment metadata does not expose a source commit SHA.
2. Stabilize order sync: test date normalization/cursor reset, verify real eBay responses, prevent duplicate import, and define safe recovery for old FAILED/DEAD_LETTER/QUEUED jobs.
3. Complete Active Listings read coverage using the appropriate read-only provider path and preserve provider source/environment/IDs.
4. Integrate eBay Returns read/workflow operations with explicit mapping to internal return records; keep any seller-impacting mutations (refund/decline/label/message) behind separately approved permissions.
5. Add Seller Account read models and business-policy/selling-limit metadata.
6. Integrate Analytics API reports with provider timestamps and marketplace/account scope.
7. Integrate Finances API payouts/transactions/fees/refunds/transfers/funds summary and reconcile against internal ledger without fabricating amounts.
8. Add contract tests, pagination/retry tests, tenant isolation, and Preview validation for each integration.

## OAuth and scope safety

The current consent scope list includes the base, Fulfillment read-only, Inventory read-only, Account read-only, and Commerce Identity read-only scopes. Returns, Analytics and Finances need an explicit scope/API compatibility review. Do not silently widen scopes or force seller re-consent. Seller-impacting actions must be treated as write operations and require product/security approval.

## Official eBay references

- Authorization and OAuth: https://developer.ebay.com/develop/guides/sell/authorization
- Inventory API coverage and migration limits: https://developer.ebay.com/api-docs/sell/inventory/overview.html
- Trading API GetMyeBaySelling: https://developer.ebay.com/DevZone/XML/docs/Reference/eBay/GetMyeBaySelling.html
- Return API: https://developer.ebay.com/develop/api/sell/sell_return
- Analytics API: https://developer.ebay.com/develop/api/sell/analytics_api
- Finances API: https://developer.ebay.com/develop/api/sell/finances_api
- Fulfillment API two-year order search limit: https://developer.ebay.com/develop/api/sell/fulfillment_api/order/getOrders