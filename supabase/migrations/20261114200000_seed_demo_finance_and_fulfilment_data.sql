-- Remaining idempotent demo module seed for ZeeshanSpace.
DO $seed$ DECLARE v_org uuid := 'd1a0a936-a447-4a3e-94a5-1f76b8f09787'; v_actor uuid; BEGIN
SELECT user_id INTO v_actor FROM public.organization_members WHERE organization_id=v_org AND is_active ORDER BY joined_at LIMIT 1;
IF v_actor IS NULL THEN RAISE EXCEPTION 'No active workspace member; demo seed aborted'; END IF;

INSERT INTO public.stock_adjustments (id,organization_id,external_id,adjustment_number,product_id,location_id,quantity_delta,target_state,reason_code,note,requested_by,requires_approval,status,approved_by,approval_note,evaluated_value_minor,created_at,updated_at) VALUES
(md5('nexusops-demo-v1:adjustment:adj_001')::uuid,v_org,'demo:adj_001','ADJ-2026-001',md5('nexusops-demo-v1:product:prd_001')::uuid,NULL,-2,'DAMAGED','DAMAGED_IN_TRANSIT','[DEMO] Approved: Scratched chassis on warehouse pallet transit.',v_actor,FALSE,'APPROVED',v_actor,'Approved: Scratched chassis on warehouse pallet transit.',7600,'2026-11-03T15:21:20.991Z'::timestamptz,'2026-11-04T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:adjustment:adj_002')::uuid,v_org,'demo:adj_002','ADJ-2026-002',md5('nexusops-demo-v1:product:prd_002')::uuid,NULL,5,'ON_HAND','COUNT_DISCREPANCY_SURPLUS','[DEMO] Discovered surplus box during routine quarterly cycle count.',v_actor,TRUE,'PENDING_APPROVAL',NULL,'Discovered surplus box during routine quarterly cycle count.',12000,'2026-11-06T15:21:20.991Z'::timestamptz,'2026-11-06T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:adjustment:adj_003')::uuid,v_org,'demo:adj_003','ADJ-2026-003',md5('nexusops-demo-v1:product:prd_004')::uuid,NULL,-1,'DAMAGED','QUALITY_ASSURANCE_REJECT','[DEMO] Spacebar key switch sticky, sent to scrap write-off.',v_actor,FALSE,'APPROVED',v_actor,'Spacebar key switch sticky, sent to scrap write-off.',3100,'2026-11-06T15:21:20.991Z'::timestamptz,'2026-11-06T15:21:20.991Z'::timestamptz)
ON CONFLICT DO NOTHING;

INSERT INTO public.purchase_orders (id,organization_id,external_id,po_number,supplier_id,status,subtotal_minor,tax_minor,total_minor,currency,notes,expected_date,created_by,approved_by,created_at,updated_at,idempotency_key,request_hash) VALUES
(md5('nexusops-demo-v1:purchaseorder:po_001')::uuid,v_org,'demo:po_001','NX-PO-2026-001',md5('nexusops-demo-v1:supplier:sup_anker')::uuid,'RECEIVED',190000,0,190000,'GBP','[DEMO] Sample purchase order','2026-11-02'::date,v_actor,v_actor,'2026-10-31T15:21:20.991Z'::timestamptz,'2026-11-03T15:21:20.991Z'::timestamptz,NULL,NULL),
(md5('nexusops-demo-v1:purchaseorder:po_002')::uuid,v_org,'demo:po_002','NX-PO-2026-002',md5('nexusops-demo-v1:supplier:sup_ugreen')::uuid,'PARTIAL_RECEIVED',82500,0,82500,'GBP','[DEMO] Sample purchase order','2026-11-06'::date,v_actor,v_actor,'2026-11-02T15:21:20.991Z'::timestamptz,'2026-11-07T15:21:20.991Z'::timestamptz,NULL,NULL),
(md5('nexusops-demo-v1:purchaseorder:po_003')::uuid,v_org,'demo:po_003','NX-PO-2026-003',md5('nexusops-demo-v1:supplier:sup_logitech')::uuid,'APPROVED',125000,0,125000,'GBP','[DEMO] Sample purchase order','2026-11-10'::date,v_actor,v_actor,'2026-11-04T15:21:20.991Z'::timestamptz,'2026-11-05T15:21:20.991Z'::timestamptz,NULL,NULL),
(md5('nexusops-demo-v1:purchaseorder:po_004')::uuid,v_org,'demo:po_004','NX-PO-2026-004',md5('nexusops-demo-v1:supplier:sup_baseus')::uuid,'DRAFT',47500,0,47500,'GBP','[DEMO] Sample purchase order','2026-11-14'::date,v_actor,NULL,'2026-11-06T15:21:20.991Z'::timestamptz,'2026-11-06T15:21:20.991Z'::timestamptz,NULL,NULL),
(md5('nexusops-demo-v1:purchaseorder:po_005')::uuid,v_org,'demo:po_005','NX-PO-2026-005',md5('nexusops-demo-v1:supplier:sup_corsair')::uuid,'SUBMITTED',93000,0,93000,'GBP','[DEMO] Sample purchase order','2026-11-12'::date,v_actor,NULL,'2026-11-05T15:21:20.991Z'::timestamptz,'2026-11-05T15:21:20.991Z'::timestamptz,NULL,NULL),
(md5('nexusops-demo-v1:purchaseorder:po_006')::uuid,v_org,'demo:po_006','NX-PO-2026-006',md5('nexusops-demo-v1:supplier:sup_samsung')::uuid,'APPROVED',240000,0,240000,'GBP','[DEMO] Sample purchase order','2026-11-11'::date,v_actor,v_actor,'2026-11-04T15:21:20.991Z'::timestamptz,'2026-11-05T15:21:20.991Z'::timestamptz,NULL,NULL)
ON CONFLICT DO NOTHING;

INSERT INTO public.purchase_order_items (id,organization_id,purchase_order_id,product_id,sku,product_name,ordered_qty,received_qty,unit_cost_minor,total_cost_minor) VALUES
(md5('nexusops-demo-v1:purchaseorderline:pol_1')::uuid,v_org,md5('nexusops-demo-v1:purchaseorder:po_001')::uuid,md5('nexusops-demo-v1:product:prd_001')::uuid,'NX-AUD-001','Nexus Pro Active Noise-Cancelling Headphones',50,50,3800,190000),
(md5('nexusops-demo-v1:purchaseorderline:pol_2')::uuid,v_org,md5('nexusops-demo-v1:purchaseorder:po_002')::uuid,md5('nexusops-demo-v1:product:prd_005')::uuid,'NX-HUB-005','Nexus 8-in-1 Aluminum USB-C Hub 100W PD',75,50,1100,82500),
(md5('nexusops-demo-v1:purchaseorderline:pol_3')::uuid,v_org,md5('nexusops-demo-v1:purchaseorder:po_003')::uuid,md5('nexusops-demo-v1:product:prd_003')::uuid,'NX-MOU-003','Nexus Precision Ergonomic Bluetooth Mouse',100,0,1250,125000),
(md5('nexusops-demo-v1:purchaseorderline:pol_4')::uuid,v_org,md5('nexusops-demo-v1:purchaseorder:po_004')::uuid,md5('nexusops-demo-v1:product:prd_008')::uuid,'NX-CHG-008','Nexus 65W GaN Fast Charger Dual USB-C',50,0,950,47500),
(md5('nexusops-demo-v1:purchaseorderline:pol_5')::uuid,v_org,md5('nexusops-demo-v1:purchaseorder:po_005')::uuid,md5('nexusops-demo-v1:product:prd_004')::uuid,'NX-KEY-004','Nexus RGB Mechanical Gaming Keyboard - Brown Switches',30,0,3100,93000),
(md5('nexusops-demo-v1:purchaseorderline:pol_6')::uuid,v_org,md5('nexusops-demo-v1:purchaseorder:po_006')::uuid,md5('nexusops-demo-v1:product:prd_011')::uuid,'NX-SSD-011','Nexus Rugged 1TB Portable NVMe External SSD',50,0,4800,240000)
ON CONFLICT DO NOTHING;

INSERT INTO public.goods_receipts (id,organization_id,receipt_number,purchase_order_id,received_by,received_at,discrepancy_note,idempotency_key,request_hash) VALUES
(md5('nexusops-demo-v1:receipt:po_001')::uuid,v_org,'DEMO-GRN-NX-PO-2026-001',md5('nexusops-demo-v1:purchaseorder:po_001')::uuid,v_actor,'2026-11-03T15:21:20.991Z'::timestamptz,'[DEMO] Sample goods receipt',NULL,NULL),
(md5('nexusops-demo-v1:receipt:po_002')::uuid,v_org,'DEMO-GRN-NX-PO-2026-002',md5('nexusops-demo-v1:purchaseorder:po_002')::uuid,v_actor,'2026-11-07T15:21:20.991Z'::timestamptz,'[DEMO] Sample goods receipt',NULL,NULL)
ON CONFLICT DO NOTHING;

INSERT INTO public.goods_receipt_items (id,organization_id,goods_receipt_id,product_id,location_id,received_qty,shortage_qty,damaged_qty) VALUES
(md5('nexusops-demo-v1:receiptline:pol_1')::uuid,v_org,md5('nexusops-demo-v1:receipt:po_001')::uuid,md5('nexusops-demo-v1:product:prd_001')::uuid,NULL,50,0,0),
(md5('nexusops-demo-v1:receiptline:pol_2')::uuid,v_org,md5('nexusops-demo-v1:receipt:po_002')::uuid,md5('nexusops-demo-v1:product:prd_005')::uuid,NULL,50,25,0)
ON CONFLICT DO NOTHING;

INSERT INTO public.returns (id,organization_id,external_id,return_number,order_id,reason_code,status,refund_amount_minor,refund_status,created_at,inspected_at) VALUES
(md5('nexusops-demo-v1:return:ret_001')::uuid,v_org,'demo:ret_001','NX-RET-2026-001',md5('nexusops-demo-v1:order:ord_gen_1001')::uuid,'DEFECTIVE','INSPECTED',8999,'ISSUED','2026-11-02T15:21:20.991Z'::timestamptz,'2026-11-04T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:return:ret_002')::uuid,v_org,'demo:ret_002','NX-RET-2026-002',md5('nexusops-demo-v1:order:ord_gen_1002')::uuid,'CHANGED_MIND','CLOSED',3499,'ISSUED','2026-11-03T15:21:20.991Z'::timestamptz,'2026-11-05T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:return:ret_003')::uuid,v_org,'demo:ret_003','NX-RET-2026-003',md5('nexusops-demo-v1:order:ord_gen_1003')::uuid,'DAMAGED_TRANSIT','RECEIVED',2999,'PENDING','2026-11-05T15:21:20.991Z'::timestamptz,NULL)
ON CONFLICT DO NOTHING;

INSERT INTO public.return_items (id,organization_id,return_id,product_id,sku,quantity,disposition,notes) VALUES
(md5('nexusops-demo-v1:returnline:retl_1')::uuid,v_org,md5('nexusops-demo-v1:return:ret_001')::uuid,md5('nexusops-demo-v1:product:prd_001')::uuid,'NX-AUD-001',1,'DAMAGED','[DEMO] Customer reported sound distortion in left ear cup'),
(md5('nexusops-demo-v1:returnline:retl_2')::uuid,v_org,md5('nexusops-demo-v1:return:ret_002')::uuid,md5('nexusops-demo-v1:product:prd_003')::uuid,'NX-MOU-003',1,'RESTOCK','[DEMO] Unopened - Buyer changed mind'),
(md5('nexusops-demo-v1:returnline:retl_3')::uuid,v_org,md5('nexusops-demo-v1:return:ret_003')::uuid,md5('nexusops-demo-v1:product:prd_005')::uuid,'NX-HUB-005',1,'QUARANTINE','[DEMO] HDMI port not displaying 4K 60Hz')
ON CONFLICT DO NOTHING;

INSERT INTO public.invoices (id,organization_id,external_id,invoice_number,invoice_type,recipient_type,recipient_id,recipient_name,issue_date,due_date,subtotal_minor,vat_rate_percent,vat_amount_minor,total_minor,paid_amount_minor,currency,status,void_reason,is_immutable,created_by,created_at) VALUES
(md5('nexusops-demo-v1:invoice:inv_001')::uuid,v_org,'demo:inv_001','INV-2026-001','SALES','CLIENT',md5('nexusops-demo-v1:client:client_apex')::uuid,'Apex Electronics Ltd','2026-11-02'::date,'2026-12-02'::date,30000,20,6000,36000,0,'GBP','PAID',NULL,TRUE,v_actor,'2026-11-02T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:invoice:inv_002')::uuid,v_org,'demo:inv_002','INV-2026-002','SALES','CLIENT',md5('nexusops-demo-v1:client:client_bolt')::uuid,'Bolt Sound & Vision Ltd','2026-11-03'::date,'2026-11-27'::date,48000,20,9600,57600,0,'GBP','ISSUED',NULL,FALSE,v_actor,'2026-11-03T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:invoice:inv_003')::uuid,v_org,'demo:inv_003','INV-2026-003','SALES','CLIENT',md5('nexusops-demo-v1:client:client_luma')::uuid,'Luma Smart Home Devices','2026-11-04'::date,'2026-11-22'::date,18000,20,3600,21600,0,'GBP','ISSUED',NULL,FALSE,v_actor,'2026-11-04T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:invoice:inv_004')::uuid,v_org,'demo:inv_004','INV-2026-004','SALES','CLIENT',md5('nexusops-demo-v1:client:client_nordic')::uuid,'Nordic Goods Trading Oy','2026-11-05'::date,'2026-12-05'::date,22000,20,4400,26400,0,'GBP','ISSUED',NULL,FALSE,v_actor,'2026-11-05T15:21:20.991Z'::timestamptz)
ON CONFLICT DO NOTHING;

INSERT INTO public.invoice_items (id,organization_id,invoice_id,description,quantity,unit_price_minor,total_minor) VALUES
(md5('nexusops-demo-v1:invoiceline:inv_001:0')::uuid,v_org,md5('nexusops-demo-v1:invoice:inv_001')::uuid,'3PL Pick & Pack Fulfilment Services (120 parcels)',120,150,18000),
(md5('nexusops-demo-v1:invoiceline:inv_001:1')::uuid,v_org,md5('nexusops-demo-v1:invoice:inv_001')::uuid,'Monthly Pallet Storage (Zone B Racking - 5 pallets)',5,2400,12000),
(md5('nexusops-demo-v1:invoiceline:inv_002:0')::uuid,v_org,md5('nexusops-demo-v1:invoice:inv_002')::uuid,'Soundbar Fulfilment & Heavy Courier Dispatch (40 units)',40,600,24000),
(md5('nexusops-demo-v1:invoiceline:inv_002:1')::uuid,v_org,md5('nexusops-demo-v1:invoice:inv_002')::uuid,'Bulk Pallet Space (Zone B - 10 Pallet bays)',10,2400,24000),
(md5('nexusops-demo-v1:invoiceline:inv_003:0')::uuid,v_org,md5('nexusops-demo-v1:invoice:inv_003')::uuid,'Smart Camera Pick & Custom Serial Scan (80 units)',80,150,12000),
(md5('nexusops-demo-v1:invoiceline:inv_003:1')::uuid,v_org,md5('nexusops-demo-v1:invoice:inv_003')::uuid,'Small Bin Secure Storage (6 Bins)',6,1000,6000),
(md5('nexusops-demo-v1:invoiceline:inv_004:0')::uuid,v_org,md5('nexusops-demo-v1:invoice:inv_004')::uuid,'Eco Throw Blanket Fulfilment & Polybagging (50 units)',50,200,10000),
(md5('nexusops-demo-v1:invoiceline:inv_004:1')::uuid,v_org,md5('nexusops-demo-v1:invoice:inv_004')::uuid,'High-Bay Pallet Reserve (5 Pallets)',5,2400,12000)
ON CONFLICT DO NOTHING;

INSERT INTO public.payments (id,organization_id,external_id,payment_number,amount_minor,currency,payment_method,payment_date,reference,payer_name,unallocated_credit_minor,recorded_by,created_at) VALUES
(md5('nexusops-demo-v1:payment:pay_001')::uuid,v_org,'demo:pay_001','PAY-2026-001',36000,'GBP','BANK_TRANSFER','2026-11-03'::date,'BACS-APEX-INV001','Apex Electronics Ltd',0,v_actor,'2026-11-03T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:payment:pay_002')::uuid,v_org,'demo:pay_002','PAY-2026-002',25000,'GBP','BANK_TRANSFER','2026-11-05'::date,'CHAPS-BOLT-PARTIAL','Bolt Gear Ltd',0,v_actor,'2026-11-05T15:21:20.991Z'::timestamptz)
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_allocations (id,organization_id,payment_id,invoice_id,amount_minor) VALUES
(md5('nexusops-demo-v1:paymentallocation:pay_001:0')::uuid,v_org,md5('nexusops-demo-v1:payment:pay_001')::uuid,md5('nexusops-demo-v1:invoice:inv_001')::uuid,36000),
(md5('nexusops-demo-v1:paymentallocation:pay_002:0')::uuid,v_org,md5('nexusops-demo-v1:payment:pay_002')::uuid,md5('nexusops-demo-v1:invoice:inv_002')::uuid,25000)
ON CONFLICT DO NOTHING;

INSERT INTO public.expenses (id,organization_id,external_id,expense_number,category,supplier_name,expense_date,amount_minor,vat_minor,currency,allocated_to,status,approved_by,note,created_at) VALUES
(md5('nexusops-demo-v1:expense:exp_001')::uuid,v_org,'demo:exp_001','DEMO-EXP_001','CARRIER_POSTAGE',NULL,'2026-11-02'::date,145000,0,'GBP','OPERATIONS','APPROVED',v_actor,'[DEMO] Royal Mail Wholesale Account Weekly Dispatch Statement RM-INV-881920','2026-11-02T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:expense:exp_002')::uuid,v_org,'demo:exp_002','DEMO-EXP_002','PACKAGING',NULL,'2026-11-03'::date,48000,9600,'GBP','OPERATIONS','APPROVED',v_actor,'[DEMO] Rajapack Recycled Cardboard Boxes & Bubble Mailers RAJA-UK-44192','2026-11-03T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:expense:exp_003')::uuid,v_org,'demo:exp_003','DEMO-EXP_003','MARKETPLACE_FEES',NULL,'2026-11-04'::date,89200,0,'GBP','OPERATIONS','APPROVED',v_actor,'[DEMO] eBay UK Monthly Final Value & Ad Promotion Fees EBAY-STMT-2026-11','2026-11-04T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:expense:exp_004')::uuid,v_org,'demo:exp_004','DEMO-EXP_004','FACILITIES',NULL,'2026-11-05'::date,65000,13000,'GBP','OPERATIONS','APPROVED',v_actor,'[DEMO] Milton Keynes Central Warehouse Unit 4 Power & Heating BRIT-GAS-COM-991','2026-11-05T15:21:20.991Z'::timestamptz)
ON CONFLICT DO NOTHING;

INSERT INTO public.marketplace_payouts (id,organization_id,external_id,payout_reference,marketplace_account_id,total_sales_minor,total_fees_minor,refunds_minor,shipping_adjustments_minor,other_adjustments_minor,net_payout_minor,currency,payout_date,status,transaction_id,bank_deposit_status,bank_reference,notes,created_at) VALUES
(md5('nexusops-demo-v1:payout:pay_uk_01')::uuid,v_org,'demo:pay_uk_01','EP-2026-UK-081',md5('nexusops-demo-v1:marketplace:mkt_ebay_uk')::uuid,489000,62592,8999,1500,0,415909,'GBP','2026-11-04'::date,'BANK_CONFIRMED','TX-EBAY-UK-99201','RECONCILED','BARCLAYS-DEP-88419','[DEMO] Settled to Barclays UK Business Account. Reconciled with bank feed.','2026-11-04T12:00:00.000Z'::timestamptz),
(md5('nexusops-demo-v1:payout:pay_uk_02')::uuid,v_org,'demo:pay_uk_02','EP-2026-UK-082',md5('nexusops-demo-v1:marketplace:mkt_ebay_uk')::uuid,234050,29958,0,0,0,204092,'GBP','2026-11-06'::date,'PAID','TX-EBAY-UK-99208','CLEARED','BARCLAYS-DEP-88502','[DEMO] Dispatched from eBay Payments. Awaiting end-of-week ledger match.','2026-11-06T12:00:00.000Z'::timestamptz),
(md5('nexusops-demo-v1:payout:pay_us_01')::uuid,v_org,'demo:pay_us_01','EP-2026-US-041',md5('nexusops-demo-v1:marketplace:mkt_ebay_us')::uuid,493846,63212,9230,0,0,421404,'USD','2026-11-03'::date,'BANK_CONFIRMED','TX-EBAY-US-41829','RECONCILED','CHASE-WIRE-55102','[DEMO] International disbursement via Chase Commercial FX conversion.','2026-11-03T14:30:00.000Z'::timestamptz),
(md5('nexusops-demo-v1:payout:pay_us_02')::uuid,v_org,'demo:pay_us_02','EP-2026-US-042',md5('nexusops-demo-v1:marketplace:mkt_ebay_us')::uuid,244615,31310,0,0,0,213305,'USD','2026-11-08'::date,'PROCESSING','TX-EBAY-US-41904','PENDING',NULL,'[DEMO] Processing batch payout in US Automated Clearing House (ACH).','2026-11-08T15:00:00.000Z'::timestamptz),
(md5('nexusops-demo-v1:payout:pay_de_01')::uuid,v_org,'demo:pay_de_01','EP-2026-DE-019',md5('nexusops-demo-v1:marketplace:mkt_ebay_de')::uuid,329060,41132,0,0,0,287928,'EUR','2026-11-05'::date,'BANK_CONFIRMED','TX-EBAY-DE-11029','RECONCILED','DEUTSCHE-SEPA-9931','[DEMO] SEPA Euro settlement completed to European treasury account.','2026-11-05T10:15:00.000Z'::timestamptz),
(md5('nexusops-demo-v1:payout:pay_de_02')::uuid,v_org,'demo:pay_de_02','EP-2026-DE-020',md5('nexusops-demo-v1:marketplace:mkt_ebay_de')::uuid,121368,15171,0,0,0,106197,'EUR','2026-11-09'::date,'INITIATED','TX-EBAY-DE-11088','PENDING',NULL,'[DEMO] eBay initiated payout transfer. Pending SEPA bank processing.','2026-11-09T08:00:00.000Z'::timestamptz)
ON CONFLICT DO NOTHING;

INSERT INTO public.payout_orders (id,organization_id,payout_id,order_id) VALUES
(md5('nexusops-demo-v1:payoutorder:pay_uk_01:ord_gen_1001')::uuid,v_org,md5('nexusops-demo-v1:payout:pay_uk_01')::uuid,md5('nexusops-demo-v1:order:ord_gen_1001')::uuid),
(md5('nexusops-demo-v1:payoutorder:pay_uk_01:ord_gen_1002')::uuid,v_org,md5('nexusops-demo-v1:payout:pay_uk_01')::uuid,md5('nexusops-demo-v1:order:ord_gen_1002')::uuid),
(md5('nexusops-demo-v1:payoutorder:pay_uk_01:ord_gen_1003')::uuid,v_org,md5('nexusops-demo-v1:payout:pay_uk_01')::uuid,md5('nexusops-demo-v1:order:ord_gen_1003')::uuid),
(md5('nexusops-demo-v1:payoutorder:pay_uk_02:ord_gen_1004')::uuid,v_org,md5('nexusops-demo-v1:payout:pay_uk_02')::uuid,md5('nexusops-demo-v1:order:ord_gen_1004')::uuid),
(md5('nexusops-demo-v1:payoutorder:pay_uk_02:ord_gen_1005')::uuid,v_org,md5('nexusops-demo-v1:payout:pay_uk_02')::uuid,md5('nexusops-demo-v1:order:ord_gen_1005')::uuid),
(md5('nexusops-demo-v1:payoutorder:pay_us_01:ord_gen_1006')::uuid,v_org,md5('nexusops-demo-v1:payout:pay_us_01')::uuid,md5('nexusops-demo-v1:order:ord_gen_1006')::uuid),
(md5('nexusops-demo-v1:payoutorder:pay_us_01:ord_gen_1007')::uuid,v_org,md5('nexusops-demo-v1:payout:pay_us_01')::uuid,md5('nexusops-demo-v1:order:ord_gen_1007')::uuid),
(md5('nexusops-demo-v1:payoutorder:pay_us_02:ord_gen_1008')::uuid,v_org,md5('nexusops-demo-v1:payout:pay_us_02')::uuid,md5('nexusops-demo-v1:order:ord_gen_1008')::uuid),
(md5('nexusops-demo-v1:payoutorder:pay_de_01:ord_gen_1009')::uuid,v_org,md5('nexusops-demo-v1:payout:pay_de_01')::uuid,md5('nexusops-demo-v1:order:ord_gen_1009')::uuid),
(md5('nexusops-demo-v1:payoutorder:pay_de_02:ord_gen_1010')::uuid,v_org,md5('nexusops-demo-v1:payout:pay_de_02')::uuid,md5('nexusops-demo-v1:order:ord_gen_1010')::uuid)
ON CONFLICT DO NOTHING;

INSERT INTO public.financial_reconciliations (id,organization_id,period,marketplace_account_id,expected_payout_minor,actual_payout_minor,difference_minor,unmatched_transactions_count,status,last_reconciled_at,reconciled_by,audit_notes,breakdown,created_at) VALUES
(md5('nexusops-demo-v1:reconciliation:rec_uk_nov')::uuid,v_org,'November 2026',md5('nexusops-demo-v1:marketplace:mkt_ebay_uk')::uuid,620001,620001,0,0,'RECONCILED','2026-11-07T16:00:00.000Z'::timestamptz,v_actor,'[DEMO] 100% verified against Barclays statement and eBay transaction report.','{"ordersGrossMinor":723050,"marketplaceFeesMinor":92550,"refundsMinor":8999,"shippingPostageMinor":1500,"bankConfirmedMinor":620001}'::jsonb,'2026-11-07T16:00:00.000Z'::timestamptz),
(md5('nexusops-demo-v1:reconciliation:rec_us_nov')::uuid,v_org,'November 2026',md5('nexusops-demo-v1:marketplace:mkt_ebay_us')::uuid,634709,634709,0,0,'RECONCILED','2026-11-07T16:15:00.000Z'::timestamptz,v_actor,'[DEMO] Chase Wire transfer matched against US sales ledger.','{"ordersGrossMinor":738461,"marketplaceFeesMinor":94522,"refundsMinor":9230,"shippingPostageMinor":0,"bankConfirmedMinor":634709}'::jsonb,'2026-11-07T16:15:00.000Z'::timestamptz),
(md5('nexusops-demo-v1:reconciliation:rec_de_nov')::uuid,v_org,'November 2026',md5('nexusops-demo-v1:marketplace:mkt_ebay_de')::uuid,394125,287928,106197,1,'IN_REVIEW','2026-11-09T07:00:00.000Z'::timestamptz,v_actor,'[DEMO] EUR 1,242.50 (£1,061.97) initiated by eBay on Nov 9, awaiting final SEPA bank arrival.','{"ordersGrossMinor":450428,"marketplaceFeesMinor":56303,"refundsMinor":0,"shippingPostageMinor":0,"bankConfirmedMinor":287928}'::jsonb,'2026-11-09T07:00:00.000Z'::timestamptz)
ON CONFLICT DO NOTHING;

INSERT INTO public.packaging_jobs (id,organization_id,job_number,client_3pl_id,job_date,packaging_type,quantity,material_cost_minor,service_charge_minor,total_charge_minor,status,invoice_id,order_id,performed_by,notes) VALUES
(md5('nexusops-demo-v1:packaging:pkg_001')::uuid,v_org,'PKG-2026-001',md5('nexusops-demo-v1:client:client_apex')::uuid,'2026-11-03T11:00:00.000Z'::timestamptz,'CUSTOM_BOX',120,7200,14400,21600,'INVOICED',md5('nexusops-demo-v1:invoice:inv_001')::uuid,(SELECT id FROM public.orders WHERE organization_id=v_org AND order_number='NX-ORD-2026-001' LIMIT 1),v_actor,'[DEMO] Double-walled carton with ESD electrostatic shielding bags.'),
(md5('nexusops-demo-v1:packaging:pkg_002')::uuid,v_org,'PKG-2026-002',md5('nexusops-demo-v1:client:client_bolt')::uuid,'2026-11-05T09:30:00.000Z'::timestamptz,'PALLET_WRAP',14,3500,10500,14000,'INVOICED',md5('nexusops-demo-v1:invoice:inv_002')::uuid,NULL,v_actor,'[DEMO] Full pallet machine shrink-wrap & corner reinforcement brackets.'),
(md5('nexusops-demo-v1:packaging:pkg_003')::uuid,v_org,'PKG-2026-003',md5('nexusops-demo-v1:client:client_zenith')::uuid,'2026-11-06T14:15:00.000Z'::timestamptz,'BUBBLE_MAILER',85,2550,6800,9350,'COMPLETED',NULL,NULL,v_actor,'[DEMO] Eco-recycled bubble mailers with tamper-evident security tape.'),
(md5('nexusops-demo-v1:packaging:pkg_004')::uuid,v_org,'PKG-2026-004',md5('nexusops-demo-v1:client:client_cloud')::uuid,'2026-11-08T16:00:00.000Z'::timestamptz,'FRAGILE_PREP',45,4050,9000,13050,'IN_PROGRESS',NULL,NULL,v_actor,'[DEMO] Suspended air foam packaging for delicate camera sensors.')
ON CONFLICT DO NOTHING;

INSERT INTO public.shipping_jobs (id,organization_id,dispatch_id,client_3pl_id,job_date,carrier,tracking_number,service_level,parcel_weight_kg,carrier_cost_minor,service_charge_minor,total_charge_minor,status,invoice_id,order_id,destination) VALUES
(md5('nexusops-demo-v1:shipping:shp_001')::uuid,v_org,'DSP-2026-001',md5('nexusops-demo-v1:client:client_apex')::uuid,'2026-11-03T16:30:00.000Z'::timestamptz,'Royal Mail','GB491028114RM','Tracked 24 with Signature',0.85,380,650,1030,'DELIVERED',md5('nexusops-demo-v1:invoice:inv_001')::uuid,(SELECT id FROM public.orders WHERE organization_id=v_org AND order_number='NX-ORD-2026-001' LIMIT 1),'{"city":"Edinburgh, UK"}'::jsonb),
(md5('nexusops-demo-v1:shipping:shp_002')::uuid,v_org,'DSP-2026-002',md5('nexusops-demo-v1:client:client_bolt')::uuid,'2026-11-05T17:00:00.000Z'::timestamptz,'DPD UK','DPD-UK-8841029','Next Day Express Courier',3.4,620,1150,1770,'IN_TRANSIT',md5('nexusops-demo-v1:invoice:inv_002')::uuid,(SELECT id FROM public.orders WHERE organization_id=v_org AND order_number='NX-ORD-2026-002' LIMIT 1),'{"city":"Birmingham, UK"}'::jsonb),
(md5('nexusops-demo-v1:shipping:shp_003')::uuid,v_org,'DSP-2026-003',md5('nexusops-demo-v1:client:client_zenith')::uuid,'2026-11-06T18:00:00.000Z'::timestamptz,'DHL Express','DHL-992019284','Worldwide Air Express',1.2,1450,2400,3850,'DISPATCHED',NULL,(SELECT id FROM public.orders WHERE organization_id=v_org AND order_number='NX-ORD-2026-003' LIMIT 1),'{"city":"Dublin, Ireland"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO public.dropshipping_calculations (id,organization_id,product_id,sku,product_name,supplier_name,purchase_cost_minor,supplier_cost_minor,shipping_cost_minor,packaging_cost_minor,additional_expenses_minor,selling_price_minor,marketplace_fee_percent,marketplace_fee_minor,other_costs_minor,shipping_option,shipping_charged_to_customer_minor,total_cost_minor,gross_profit_minor,margin_percent,net_profit_minor,currency,updated_by,updated_at) VALUES
(md5('nexusops-demo-v1:dropshipping:ds_calc_001')::uuid,v_org,md5('nexusops-demo-v1:product:prd_001')::uuid,'NX-AUD-001','Nexus Pro Active Noise-Cancelling Headphones','Anker Innovations Technology Ltd',3800,3800,450,120,50,8999,12.8,1152,30,'SHIPPING_INCLUDED',0,4420,4579,50.88,3367,'GBP',v_actor,'2026-11-08T12:00:00.000Z'::timestamptz),
(md5('nexusops-demo-v1:dropshipping:ds_calc_002')::uuid,v_org,md5('nexusops-demo-v1:product:prd_002')::uuid,'NX-CAM-002','Nexus 4K Ultra Wide StreamCam with Stereo Mic','Logitech Europe S.A.',2400,2400,395,95,40,5999,12.8,768,30,'SHIPPING_EXCLUDED',395,2535,3464,57.74,2666,'GBP',v_actor,'2026-11-08T12:15:00.000Z'::timestamptz)
ON CONFLICT DO NOTHING;

INSERT INTO public.audit_logs (id,organization_id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes,created_at) VALUES
(md5('nexusops-demo-v1:audit:aud_01')::uuid,v_org,v_actor,'SYSTEM_BOOT','SystemConfig','cfg_001',NULL,NULL,'[DEMO] Configured business currency GBP and VAT rate 20%','2026-10-31T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:audit:aud_02')::uuid,v_org,v_actor,'CONNECT_ACCOUNT','MarketplaceAccount','mkt_ebay_uk',NULL,NULL,'[DEMO] Connected eBay UK production seller credentials.','2026-10-31T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:audit:aud_03')::uuid,v_org,v_actor,'APPROVE_PO','PurchaseOrder','po_001',NULL,NULL,'[DEMO] Approved purchase order for Anker headphones £1,900.00','2026-11-02T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:audit:aud_04')::uuid,v_org,v_actor,'GOODS_RECEIPT','GoodsReceipt','grn_001',NULL,NULL,'[DEMO] Completed full goods receipt for 50 units NX-AUD-001','2026-11-03T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:audit:aud_05')::uuid,v_org,v_actor,'APPROVE_ADJUSTMENT','StockAdjustment','adj_001',NULL,NULL,'[DEMO] Approved -2 damaged adjustment for NX-AUD-001','2026-11-04T15:21:20.991Z'::timestamptz)
ON CONFLICT DO NOTHING;

INSERT INTO public.notifications (id,organization_id,user_id,notification_type,title,message,severity,reference_url,is_read,is_dismissed,created_at) VALUES
(md5('nexusops-demo-v1:notification:notif_exc_1794313347641')::uuid,v_org,NULL,'UNMAPPED_SKU','[DEMO] Unmapped SKU: EBAY-UNMAPPED-USB-CABLE','External listing SKU "EBAY-UNMAPPED-USB-CABLE" on Order 19-09555-46578 requires manual catalog mapping.','WARNING','/sales/ebay-accounts',FALSE,FALSE,'2026-11-10T12:22:27.641Z'::timestamptz),
(md5('nexusops-demo-v1:notification:notif_exc_1794313347641')::uuid,v_org,NULL,'UNMAPPED_SKU','[DEMO] Unmapped SKU: EBAY-UK-NXCAM002','External listing SKU "EBAY-UK-NXCAM002" on Order 19-09499-31152 requires manual catalog mapping.','WARNING','/sales/ebay-accounts',FALSE,FALSE,'2026-11-10T12:22:27.641Z'::timestamptz),
(md5('nexusops-demo-v1:notification:notif_exc_1794313347640')::uuid,v_org,NULL,'UNMAPPED_SKU','[DEMO] Unmapped SKU: EBAY-UK-NXAUD001','External listing SKU "EBAY-UK-NXAUD001" on Order 19-09412-88211 requires manual catalog mapping.','WARNING','/sales/ebay-accounts',FALSE,FALSE,'2026-11-10T12:22:27.640Z'::timestamptz),
(md5('nexusops-demo-v1:notification:not_01')::uuid,v_org,NULL,'LOW_STOCK','[DEMO] Low Stock Alert: NX-AUD-001','Nexus Pro Headphones available quantity is at or below the reorder threshold (15 units).','WARNING',NULL,FALSE,FALSE,'2026-11-06T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:notification:not_02')::uuid,v_org,NULL,'STOCK_ADJUSTMENT','[DEMO] Stock Adjustment Pending Review','Warehouse logged surplus +5 units on NX-CAM-002 requiring manager sign-off.','INFO',NULL,FALSE,FALSE,'2026-11-06T15:21:20.991Z'::timestamptz),
(md5('nexusops-demo-v1:notification:not_03')::uuid,v_org,NULL,'EBAY_SYNC','[DEMO] eBay Multi-Account Sync Complete','3 new orders imported into pipeline. Duplicate prevention verified.','SUCCESS',NULL,FALSE,FALSE,'2026-11-07T14:21:20.991Z'::timestamptz)
ON CONFLICT DO NOTHING;

INSERT INTO public.storage_snapshots (id,organization_id,client_3pl_id,snapshot_date,occupied_pallets,occupied_shelves,occupied_bins,estimated_cost_minor,currency) VALUES
(md5('nexusops-demo-v1:snapshot:client_apex:2026-11-14')::uuid,v_org,md5('nexusops-demo-v1:client:client_apex')::uuid,'2026-11-14',2,6,15,10950,'GBP'),
(md5('nexusops-demo-v1:snapshot:client_bolt:2026-11-14')::uuid,v_org,md5('nexusops-demo-v1:client:client_bolt')::uuid,'2026-11-14',3,8,19,14950,'GBP'),
(md5('nexusops-demo-v1:snapshot:client_luma:2026-11-14')::uuid,v_org,md5('nexusops-demo-v1:client:client_luma')::uuid,'2026-11-14',4,10,23,18950,'GBP'),
(md5('nexusops-demo-v1:snapshot:client_nordic:2026-11-14')::uuid,v_org,md5('nexusops-demo-v1:client:client_nordic')::uuid,'2026-11-14',5,12,27,22950,'GBP'),
(md5('nexusops-demo-v1:snapshot:client_stellar:2026-11-14')::uuid,v_org,md5('nexusops-demo-v1:client:client_stellar')::uuid,'2026-11-14',6,14,31,26950,'GBP')
ON CONFLICT DO NOTHING;

INSERT INTO public.chart_of_accounts(id,organization_id,account_code,account_name,account_type,currency,is_active)
VALUES
(md5('nexusops-demo-v1:coa:2200')::uuid,v_org,'2200','VAT Output Liability','LIABILITY','GBP',true),
(md5('nexusops-demo-v1:coa:5100')::uuid,v_org,'5100','Operating Expenses','EXPENSE','GBP',true),
(md5('nexusops-demo-v1:coa:5110')::uuid,v_org,'5110','Carrier Postage Expense','EXPENSE','GBP',true),
(md5('nexusops-demo-v1:coa:5120')::uuid,v_org,'5120','Packaging Materials Expense','EXPENSE','GBP',true)
ON CONFLICT (organization_id,account_code) DO NOTHING;

INSERT INTO public.journal_entries (id,organization_id,entry_number,entry_date,source_type,source_id,description,status,idempotency_key,created_by,posted_at,created_at) VALUES
(md5('nexusops-demo-v1:journal:invoice:inv_001')::uuid,v_org,'DEMO-JE-INV-INV-2026-001','2026-11-02'::date,'INVOICE',md5('nexusops-demo-v1:invoice:inv_001')::uuid,'[DEMO] Invoice INV-2026-001','POSTED','demo-seed:invoice:inv_001',v_actor,'2026-11-02'::date,'2026-11-02'::date),
(md5('nexusops-demo-v1:journal:invoice:inv_002')::uuid,v_org,'DEMO-JE-INV-INV-2026-002','2026-11-03'::date,'INVOICE',md5('nexusops-demo-v1:invoice:inv_002')::uuid,'[DEMO] Invoice INV-2026-002','POSTED','demo-seed:invoice:inv_002',v_actor,'2026-11-03'::date,'2026-11-03'::date),
(md5('nexusops-demo-v1:journal:invoice:inv_003')::uuid,v_org,'DEMO-JE-INV-INV-2026-003','2026-11-04'::date,'INVOICE',md5('nexusops-demo-v1:invoice:inv_003')::uuid,'[DEMO] Invoice INV-2026-003','POSTED','demo-seed:invoice:inv_003',v_actor,'2026-11-04'::date,'2026-11-04'::date),
(md5('nexusops-demo-v1:journal:invoice:inv_004')::uuid,v_org,'DEMO-JE-INV-INV-2026-004','2026-11-05'::date,'INVOICE',md5('nexusops-demo-v1:invoice:inv_004')::uuid,'[DEMO] Invoice INV-2026-004','POSTED','demo-seed:invoice:inv_004',v_actor,'2026-11-05'::date,'2026-11-05'::date),
(md5('nexusops-demo-v1:journal:payment:pay_001')::uuid,v_org,'DEMO-JE-PAY-PAY-2026-001','2026-11-03'::date,'PAYMENT',md5('nexusops-demo-v1:payment:pay_001')::uuid,'[DEMO] Payment PAY-2026-001','POSTED','demo-seed:payment:pay_001',v_actor,'2026-11-03'::date,'2026-11-03'::date),
(md5('nexusops-demo-v1:journal:payment:pay_002')::uuid,v_org,'DEMO-JE-PAY-PAY-2026-002','2026-11-05'::date,'PAYMENT',md5('nexusops-demo-v1:payment:pay_002')::uuid,'[DEMO] Payment PAY-2026-002','POSTED','demo-seed:payment:pay_002',v_actor,'2026-11-05'::date,'2026-11-05'::date),
(md5('nexusops-demo-v1:journal:expense:exp_001')::uuid,v_org,'DEMO-JE-EXP-EXP_001','2026-11-02'::date,'EXPENSE',md5('nexusops-demo-v1:expense:exp_001')::uuid,'[DEMO] Royal Mail Wholesale Account Weekly Dispatch Statement','POSTED','demo-seed:expense:exp_001',v_actor,'2026-11-02'::date,'2026-11-02'::date),
(md5('nexusops-demo-v1:journal:expense:exp_002')::uuid,v_org,'DEMO-JE-EXP-EXP_002','2026-11-03'::date,'EXPENSE',md5('nexusops-demo-v1:expense:exp_002')::uuid,'[DEMO] Rajapack Recycled Cardboard Boxes & Bubble Mailers','POSTED','demo-seed:expense:exp_002',v_actor,'2026-11-03'::date,'2026-11-03'::date),
(md5('nexusops-demo-v1:journal:expense:exp_003')::uuid,v_org,'DEMO-JE-EXP-EXP_003','2026-11-04'::date,'EXPENSE',md5('nexusops-demo-v1:expense:exp_003')::uuid,'[DEMO] eBay UK Monthly Final Value & Ad Promotion Fees','POSTED','demo-seed:expense:exp_003',v_actor,'2026-11-04'::date,'2026-11-04'::date),
(md5('nexusops-demo-v1:journal:expense:exp_004')::uuid,v_org,'DEMO-JE-EXP-EXP_004','2026-11-05'::date,'EXPENSE',md5('nexusops-demo-v1:expense:exp_004')::uuid,'[DEMO] Milton Keynes Central Warehouse Unit 4 Power & Heating','POSTED','demo-seed:expense:exp_004',v_actor,'2026-11-05'::date,'2026-11-05'::date),
(md5('nexusops-demo-v1:journal:receipt:po_001')::uuid,v_org,'DEMO-JE-GRN-NX-PO-2026-001','2026-11-03'::date,'GOODS_RECEIPT',md5('nexusops-demo-v1:purchaseorder:po_001')::uuid,'[DEMO] Inventory receipt NX-PO-2026-001','POSTED','demo-seed:receipt:po_001',v_actor,'2026-11-03'::date,'2026-11-03'::date),
(md5('nexusops-demo-v1:journal:receipt:po_002')::uuid,v_org,'DEMO-JE-GRN-NX-PO-2026-002','2026-11-07'::date,'GOODS_RECEIPT',md5('nexusops-demo-v1:purchaseorder:po_002')::uuid,'[DEMO] Inventory receipt NX-PO-2026-002','POSTED','demo-seed:receipt:po_002',v_actor,'2026-11-07'::date,'2026-11-07'::date)
ON CONFLICT DO NOTHING;

INSERT INTO public.journal_entry_lines (id,organization_id,journal_entry_id,account_id,debit_minor,credit_minor,description) VALUES
(md5('nexusops-demo-v1:journalline:invoice:inv_001:0')::uuid,v_org,md5('nexusops-demo-v1:journal:invoice:inv_001')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1200' LIMIT 1),36000,0,'Accounts receivable'),
(md5('nexusops-demo-v1:journalline:invoice:inv_001:1')::uuid,v_org,md5('nexusops-demo-v1:journal:invoice:inv_001')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='4000' LIMIT 1),0,30000,'Sales revenue'),
(md5('nexusops-demo-v1:journalline:invoice:inv_001:2')::uuid,v_org,md5('nexusops-demo-v1:journal:invoice:inv_001')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='2200' LIMIT 1),0,6000,'VAT output liability'),
(md5('nexusops-demo-v1:journalline:invoice:inv_002:0')::uuid,v_org,md5('nexusops-demo-v1:journal:invoice:inv_002')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1200' LIMIT 1),57600,0,'Accounts receivable'),
(md5('nexusops-demo-v1:journalline:invoice:inv_002:1')::uuid,v_org,md5('nexusops-demo-v1:journal:invoice:inv_002')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='4000' LIMIT 1),0,48000,'Sales revenue'),
(md5('nexusops-demo-v1:journalline:invoice:inv_002:2')::uuid,v_org,md5('nexusops-demo-v1:journal:invoice:inv_002')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='2200' LIMIT 1),0,9600,'VAT output liability'),
(md5('nexusops-demo-v1:journalline:invoice:inv_003:0')::uuid,v_org,md5('nexusops-demo-v1:journal:invoice:inv_003')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1200' LIMIT 1),21600,0,'Accounts receivable'),
(md5('nexusops-demo-v1:journalline:invoice:inv_003:1')::uuid,v_org,md5('nexusops-demo-v1:journal:invoice:inv_003')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='4000' LIMIT 1),0,18000,'Sales revenue'),
(md5('nexusops-demo-v1:journalline:invoice:inv_003:2')::uuid,v_org,md5('nexusops-demo-v1:journal:invoice:inv_003')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='2200' LIMIT 1),0,3600,'VAT output liability'),
(md5('nexusops-demo-v1:journalline:invoice:inv_004:0')::uuid,v_org,md5('nexusops-demo-v1:journal:invoice:inv_004')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1200' LIMIT 1),26400,0,'Accounts receivable'),
(md5('nexusops-demo-v1:journalline:invoice:inv_004:1')::uuid,v_org,md5('nexusops-demo-v1:journal:invoice:inv_004')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='4000' LIMIT 1),0,22000,'Sales revenue'),
(md5('nexusops-demo-v1:journalline:invoice:inv_004:2')::uuid,v_org,md5('nexusops-demo-v1:journal:invoice:inv_004')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='2200' LIMIT 1),0,4400,'VAT output liability'),
(md5('nexusops-demo-v1:journalline:payment:pay_001:0')::uuid,v_org,md5('nexusops-demo-v1:journal:payment:pay_001')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1000' LIMIT 1),36000,0,'Bank receipt'),
(md5('nexusops-demo-v1:journalline:payment:pay_001:1')::uuid,v_org,md5('nexusops-demo-v1:journal:payment:pay_001')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1200' LIMIT 1),0,36000,'Accounts receivable settlement'),
(md5('nexusops-demo-v1:journalline:payment:pay_002:0')::uuid,v_org,md5('nexusops-demo-v1:journal:payment:pay_002')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1000' LIMIT 1),25000,0,'Bank receipt'),
(md5('nexusops-demo-v1:journalline:payment:pay_002:1')::uuid,v_org,md5('nexusops-demo-v1:journal:payment:pay_002')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1200' LIMIT 1),0,25000,'Accounts receivable settlement'),
(md5('nexusops-demo-v1:journalline:expense:exp_001:0')::uuid,v_org,md5('nexusops-demo-v1:journal:expense:exp_001')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='5110' LIMIT 1),145000,0,'Operating expense'),
(md5('nexusops-demo-v1:journalline:expense:exp_001:1')::uuid,v_org,md5('nexusops-demo-v1:journal:expense:exp_001')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1000' LIMIT 1),0,145000,'Bank payment'),
(md5('nexusops-demo-v1:journalline:expense:exp_002:0')::uuid,v_org,md5('nexusops-demo-v1:journal:expense:exp_002')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='5120' LIMIT 1),48000,0,'Operating expense'),
(md5('nexusops-demo-v1:journalline:expense:exp_002:1')::uuid,v_org,md5('nexusops-demo-v1:journal:expense:exp_002')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1000' LIMIT 1),0,48000,'Bank payment'),
(md5('nexusops-demo-v1:journalline:expense:exp_003:0')::uuid,v_org,md5('nexusops-demo-v1:journal:expense:exp_003')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='5100' LIMIT 1),89200,0,'Operating expense'),
(md5('nexusops-demo-v1:journalline:expense:exp_003:1')::uuid,v_org,md5('nexusops-demo-v1:journal:expense:exp_003')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1000' LIMIT 1),0,89200,'Bank payment'),
(md5('nexusops-demo-v1:journalline:expense:exp_004:0')::uuid,v_org,md5('nexusops-demo-v1:journal:expense:exp_004')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='5100' LIMIT 1),65000,0,'Operating expense'),
(md5('nexusops-demo-v1:journalline:expense:exp_004:1')::uuid,v_org,md5('nexusops-demo-v1:journal:expense:exp_004')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1000' LIMIT 1),0,65000,'Bank payment'),
(md5('nexusops-demo-v1:journalline:receipt:po_001:0')::uuid,v_org,md5('nexusops-demo-v1:journal:receipt:po_001')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1300' LIMIT 1),190000,0,'Inventory received'),
(md5('nexusops-demo-v1:journalline:receipt:po_001:1')::uuid,v_org,md5('nexusops-demo-v1:journal:receipt:po_001')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='2050' LIMIT 1),0,190000,'Goods received not invoiced'),
(md5('nexusops-demo-v1:journalline:receipt:po_002:0')::uuid,v_org,md5('nexusops-demo-v1:journal:receipt:po_002')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='1300' LIMIT 1),55000,0,'Inventory received'),
(md5('nexusops-demo-v1:journalline:receipt:po_002:1')::uuid,v_org,md5('nexusops-demo-v1:journal:receipt:po_002')::uuid,(SELECT id FROM public.chart_of_accounts WHERE organization_id=v_org AND account_code='2050' LIMIT 1),0,55000,'Goods received not invoiced')
ON CONFLICT DO NOTHING;

UPDATE public.invoices i SET paid_amount_minor=COALESCE((SELECT SUM(pa.amount_minor) FROM public.payment_allocations pa WHERE pa.organization_id=v_org AND pa.invoice_id=i.id),0) WHERE i.organization_id=v_org AND i.external_id LIKE 'demo:%';

END $seed$;