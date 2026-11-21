# Milestone 2 — eBay Integration Completion Plan

**Baseline:** main + Milestone 1 audit findings, 2026-11-21
**Goal:** Complete provider-sourced eBay seller operations without replacing existing dashboard modules or corrupting live records.

## Existing implementation — retain and harden

- OAuth authorization-code flow, one-time state, encrypted credentials/tokens, token refresh lease and seller identity mapping.
- Sell Fulfillment order import, two-year date clamp, cursor/checkpoint, idempotency, SKU exception queue.
- Inventory API item/offer sync and listing snapshots.
- Scheduled sync job leasing and Production-only order notifications.

## Work packages and acceptance criteria

| Work package | Implementation | Acceptance evidence |
|---|---|---|
| M2.1 Order sync stabilization | **Implemented in PR #160:** classify permanent vs transient eBay errors; stop automatic retries for 30830/HTTP 4xx; separate last-attempt from last-success timestamps; atomically enqueue one active scheduled job per seller; coalesce redundant queued/failed jobs without deleting records; claim at most one job per seller per scheduler pass; treat imported orders with SKU exceptions as completed sync work. The live Production migration history now includes the M2.1 queue hardening. | Cloudflare Preview: typecheck passed, 86 tests passed/0 failed, Vite build and Preview deploy passed; isolated DB migration test still pending; Production API/idempotency verification and recovery dry-run report still pending |
| M2.2 Active Listings | Add read-only compatibility coverage for Seller Hub/Trading API listings not represented in Inventory API; normalize source IDs/SKUs/status/price/currency without inventing fields | Compare provider counts and sample records against Seller Hub for approved test seller |
| M2.3 Returns | Import seller return requests/status/line items and map to internal returns; preserve provider IDs and status history | non-Production contract tests, idempotent return import, tenant isolation |
| M2.4 Seller Account | Read seller identity, selling limits/status, business policies and account capabilities | Read-only provider snapshot and UI coverage |
| M2.5 Analytics | Import traffic reports, seller standards and supported customer-service metrics | Date-range, marketplace and account scoping tests |
| M2.6 Finances | Import payouts, transactions, fees, refunds, transfers and seller funds summary; map provider references to internal ledger with reconciliation controls | Exact-amount/currency preservation, duplicate protection, reconciliation tests |
| M2.7 Release hardening | Permission, pagination, rate-limit, token-expiry, retry, audit and mobile UI tests | Cloudflare Preview build and test suite; no Production writes during Preview |

## Production safety rules

- No eBay Production sync, retry, scheduler execution, OAuth scope widening, seller mutation, or data backfill without explicit approval.
- Never bulk-retry the existing queue. First produce a dry-run recovery plan grouped by account, status, error code, attempts and idempotency key.
- Preserve all provider identifiers, amounts, currencies, timestamps and original safe payload fields exactly as returned.
- Never infer missing SKU, listing ID, return ID, payout amount, buyer identity or source timestamp.
- Sandbox and Production records remain separated by environment and organization.
- No seller-impacting return/fulfilment/Inventory write operation until separately approved.

## First implementation slice

Start with M2.1. The Worker already clamps order search dates to the rolling two-year window. The new implementation adds deterministic permanent/transient retry classification and prevents repeated scheduled queue creation. Its SQL migration is intentionally not applied to Production in this PR; the migration must be reviewed and approved before deploying the Worker code because the Worker uses the new database column and RPC. No queue recovery or Production eBay sync is performed.