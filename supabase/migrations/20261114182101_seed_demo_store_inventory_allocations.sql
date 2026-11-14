-- Every demo listing receives a distinct, non-overlapping stock allocation.
-- At least five units are seeded for demo listings with no demo sales; physical stock is not altered.
WITH mapped AS (
  SELECT ma.organization_id,ma.id AS marketplace_account_id,msm.product_id,
         GREATEST(5,COALESCE(SUM(oi.quantity),0))::integer AS desired_quantity
  FROM public.marketplace_accounts ma
  JOIN public.marketplace_sku_mappings msm
    ON msm.marketplace_account_id=ma.id AND msm.organization_id=ma.organization_id
  LEFT JOIN public.orders o
    ON o.marketplace_account_id=ma.id AND o.organization_id=ma.organization_id
  LEFT JOIN public.order_items oi
    ON oi.order_id=o.id AND oi.organization_id=o.organization_id AND oi.product_id=msm.product_id
  WHERE ma.is_demo=true
  GROUP BY ma.organization_id,ma.id,msm.product_id
), stock AS (
  SELECT organization_id,product_id,
    GREATEST(0,COALESCE(SUM(quantity_delta) FILTER (WHERE stock_state='ON_HAND'),0))::integer AS on_hand
  FROM public.stock_ledger GROUP BY organization_id,product_id
), weighted AS (
  SELECT m.*,s.on_hand,SUM(m.desired_quantity) OVER (PARTITION BY m.organization_id,m.product_id) AS desired_total
  FROM mapped m JOIN stock s ON s.organization_id=m.organization_id AND s.product_id=m.product_id
)
INSERT INTO public.marketplace_inventory_allocations(
  organization_id,marketplace_account_id,product_id,allocated_quantity,reserved_quantity,source
)
SELECT organization_id,marketplace_account_id,product_id,
  CASE WHEN desired_total<=on_hand THEN desired_quantity
       ELSE FLOOR(on_hand::numeric*desired_quantity/NULLIF(desired_total,0))::integer END,
  0,'DEMO_SEED'
FROM weighted
WHERE on_hand>0
ON CONFLICT (marketplace_account_id,product_id)
DO UPDATE SET allocated_quantity=EXCLUDED.allocated_quantity,
              reserved_quantity=EXCLUDED.reserved_quantity,
              source='DEMO_SEED',updated_at=now()
WHERE public.marketplace_inventory_allocations.source='DEMO_SEED';
