-- PRODUCTION MIGRATION
-- Allow checkpoint records for the Production eBay Active Listings and Returns
-- pagination cursors. Existing checkpoint rows and business data are preserved.

ALTER TABLE public.marketplace_sync_checkpoints
  DROP CONSTRAINT IF EXISTS marketplace_sync_checkpoints_resource_type_check;

ALTER TABLE public.marketplace_sync_checkpoints
  ADD CONSTRAINT marketplace_sync_checkpoints_resource_type_check
  CHECK (
    resource_type = ANY (
      ARRAY[
        'ORDERS'::text,
        'INVENTORY'::text,
        'OFFERS'::text,
        'FINANCES'::text,
        'FULFILMENT'::text,
        'ACTIVE_LISTINGS_TRADING'::text,
        'RETURNS'::text
      ]
    )
  );
