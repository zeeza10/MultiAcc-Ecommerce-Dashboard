# eBay listing sync: API coverage and diagnostic contract

## Current implementation

The Worker currently calls these REST endpoints with the seller's delegated OAuth token:

- Orders: `GET /sell/fulfillment/v1/order`
- Inventory items: `GET /sell/inventory/v1/inventory_item?limit=25&offset=...`
- Offers per SKU: `GET /sell/inventory/v1/offer?sku=...&marketplace_id=...`

The Inventory API data model consists of Inventory Items, Offers and Locations. An Offer becomes a live listing when published through Inventory API. The current read-only sync does not create, revise, publish, withdraw or delete seller listings.

The current OAuth scopes include `sell.inventory.readonly`. This permits reading Inventory API data that is represented in the Inventory API model. It does **not** prove that every listing visible in Seller Hub is represented there. Existing legacy listings created through Seller Hub or Trading API may be absent.

## Listing coverage decision

There are two eBay-supported approaches for broader active-listing coverage:

1. **Trading API `GetMyeBaySelling` / ActiveList** — returns the authenticated seller's active listings, with page-based pagination. This is the compatibility path to evaluate for legacy Seller Hub/Trading API listings. It has a documented 25,000-item ceiling (125 pages) and short-duration rate limits. Implement only after validating OAuth token compatibility, XML parsing, and required fields against Sandbox and a controlled seller account.
2. **Sell Feed API Active Inventory Report** — use the Feed API inventory task flow and download the generated report. eBay documents `LMS_ACTIVE_INVENTORY_REPORT` / `ActiveInventoryReport` and states that it requires the broader `https://api.ebay.com/oauth/api_scope/sell.inventory` scope. This is not the same as the current `sell.inventory.readonly` scope. Do not add or request it silently: it changes consent and may enable write-capable inventory operations. Obtain explicit product/security approval and seller re-consent first. eBay documents a 25-feed-per-seller-per-24-hour limit for active inventory reports.

The Taxonomy API is not a listings retrieval API; it supplies category trees and item aspects. It is not required just to read the seller's existing listings.

## Required read model

Keep provider data separate from internal product/order data. For each provider listing, persist only fields actually returned by eBay, retaining the original provider response for traceability:

- marketplace account and environment
- provider listing/item ID (when supplied)
- SKU (when supplied)
- title, condition, listing state
- inventory quantity and offer quantity separately
- price and currency
- listing URL (when supplied)
- provider modified/created timestamps (when supplied)
- raw provider response and observed/synced timestamp

Do not manufacture missing SKUs, IDs, prices, statuses, or source timestamps. Do not interpret an Inventory Item with no Offer as an active listing; present it as inventory without a matching offer.

## Sync diagnostic contract

Every API call failure should retain:

- operation/stage and exact endpoint path (never access token or authorization headers)
- HTTP status
- eBay error ID/code, domain/category where supplied
- sanitized eBay message / longMessage
- retryability classification and retry-after value where supplied
- seller account, environment, SKU or provider ID where applicable
- attempt number and observed timestamp

Never persist bearer tokens, refresh tokens, client secrets, OAuth codes, or full request headers. Sanitize provider messages before showing them to workspace users. Keep the unmodified provider response only if it is known not to contain credentials or personal data; otherwise retain a deliberately redacted diagnostic subset.

## Queue and run lifecycle

- Each claimed job must reach `SUCCEEDED`, `FAILED`, or `DEAD_LETTER`; no caught exception should be swallowed.
- A failed attempt must clear its lease and record the real sanitized error.
- Expired `RUNNING` jobs must be reclaimable; exhausted jobs must be terminal and have `completed_at`.
- Retry delay should honor provider `Retry-After` when present, otherwise use bounded exponential backoff with jitter.
- Separate Orders and Listings/Inventory results. A successful order import must not be rolled back or hidden by a listing failure.
- A run is successful only when all required pages and steps have completed; partial page progress must remain visible and resumable.

## References

- Inventory API overview: https://developer.ebay.com/api-docs/sell/inventory/overview.html
- Inventory API endpoint index: https://developer.ebay.com/develop/api/sell/inventory_api
- Sell Feed API: https://developer.ebay.com/develop/api/sell/feed_api
- Sell Feed API usage and scopes: https://developer.ebay.com/api-docs/sell/static/feed/sell-feed.html
- Active inventory report feed reference: https://developer.ebay.com/api-docs/sell/static/feed/lms-feeds-quick-reference.html
- Trading API GetMyeBaySelling: https://developer.ebay.com/Devzone/xml/docs/Reference/eBay/GetMyeBaySelling.html
- eBay API error response structure: https://developer.ebay.com/api-docs/handling-error-messages.html
