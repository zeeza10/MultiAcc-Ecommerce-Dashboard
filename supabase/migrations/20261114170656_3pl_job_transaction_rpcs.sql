CREATE OR REPLACE FUNCTION public.create_packaging_job(
  p_organization_id uuid,
  p_client_3pl_id uuid,
  p_job_date date,
  p_packaging_type text,
  p_quantity integer,
  p_material_cost_minor bigint,
  p_order_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private
AS $$
DECLARE v_client public.clients_3pl%ROWTYPE; v_rate public.rate_cards%ROWTYPE; v_job public.packaging_jobs%ROWTYPE;
 v_id uuid:=gen_random_uuid(); v_no text:='PKG-'||to_char(COALESCE(p_job_date,current_date),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 v_service bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT private.has_org_permission(p_organization_id,'fulfilment.manage') THEN RAISE EXCEPTION 'Not authorized to create packaging jobs' USING ERRCODE='42501'; END IF;
 IF p_quantity IS NULL OR p_quantity<=0 OR p_quantity>100000 THEN RAISE EXCEPTION 'Packaging quantity must be a positive whole number' USING ERRCODE='22023'; END IF;
 IF p_material_cost_minor IS NULL OR p_material_cost_minor<0 THEN RAISE EXCEPTION 'Material cost cannot be negative' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_client FROM public.clients_3pl WHERE organization_id=p_organization_id AND id=p_client_3pl_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION '3PL client not found in this workspace' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_rate FROM public.rate_cards WHERE organization_id=p_organization_id AND id=v_client.rate_card_id;
 v_service:=COALESCE(v_rate.pack_fee_minor,0)*p_quantity + COALESCE(v_rate.extra_item_fee_minor,0)*GREATEST(p_quantity-1,0);
 IF p_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.orders WHERE organization_id=p_organization_id AND id=p_order_id AND client_3pl_id=p_client_3pl_id) THEN
   RAISE EXCEPTION 'Selected order does not belong to this 3PL client' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.packaging_jobs(id,organization_id,job_number,client_3pl_id,job_date,packaging_type,quantity,material_cost_minor,service_charge_minor,total_charge_minor,status,order_id,performed_by,notes)
 VALUES(v_id,p_organization_id,v_no,p_client_3pl_id,COALESCE(p_job_date,current_date),btrim(p_packaging_type),p_quantity,p_material_cost_minor,v_service,p_material_cost_minor+v_service,'COMPLETED',p_order_id,auth.uid(),left(COALESCE(p_notes,''),1000))
 RETURNING * INTO v_job;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,after_snapshot,notes)
 VALUES(p_organization_id,auth.uid(),'PACKAGING_JOB_CREATED','packaging_jobs',v_id::text,to_jsonb(v_job),'Packaging job created using the client rate card.');
 RETURN to_jsonb(v_job);
END $$;

CREATE OR REPLACE FUNCTION public.create_shipping_job(
  p_organization_id uuid,
  p_client_3pl_id uuid,
  p_job_date date,
  p_carrier text,
  p_tracking_number text,
  p_service_level text,
  p_parcel_weight_kg numeric,
  p_carrier_cost_minor bigint,
  p_service_charge_minor bigint,
  p_destination text,
  p_order_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private
AS $$
DECLARE v_client public.clients_3pl%ROWTYPE; v_job public.shipping_jobs%ROWTYPE;
 v_id uuid:=gen_random_uuid(); v_dispatch text:='DSP-'||to_char(COALESCE(p_job_date,current_date),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
BEGIN
 IF auth.uid() IS NULL OR NOT private.has_org_permission(p_organization_id,'fulfilment.manage') THEN RAISE EXCEPTION 'Not authorized to create shipping jobs' USING ERRCODE='42501'; END IF;
 IF COALESCE(btrim(p_carrier),'')='' OR COALESCE(btrim(p_service_level),'')='' OR COALESCE(btrim(p_destination),'')='' THEN RAISE EXCEPTION 'Carrier, service level and destination are required' USING ERRCODE='22023'; END IF;
 IF p_parcel_weight_kg IS NULL OR p_parcel_weight_kg<=0 OR p_parcel_weight_kg>1000 THEN RAISE EXCEPTION 'Parcel weight must be greater than zero' USING ERRCODE='22023'; END IF;
 IF COALESCE(p_carrier_cost_minor,0)<0 OR COALESCE(p_service_charge_minor,0)<0 THEN RAISE EXCEPTION 'Shipping charges cannot be negative' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_client FROM public.clients_3pl WHERE organization_id=p_organization_id AND id=p_client_3pl_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION '3PL client not found in this workspace' USING ERRCODE='P0002'; END IF;
 IF p_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.orders WHERE organization_id=p_organization_id AND id=p_order_id AND client_3pl_id=p_client_3pl_id) THEN
   RAISE EXCEPTION 'Selected order does not belong to this 3PL client' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.shipping_jobs(id,organization_id,dispatch_id,client_3pl_id,job_date,carrier,tracking_number,service_level,parcel_weight_kg,carrier_cost_minor,service_charge_minor,total_charge_minor,status,order_id,destination)
 VALUES(v_id,p_organization_id,v_dispatch,p_client_3pl_id,COALESCE(p_job_date,current_date),btrim(p_carrier),nullif(btrim(COALESCE(p_tracking_number,'')),''),btrim(p_service_level),p_parcel_weight_kg,p_carrier_cost_minor,p_service_charge_minor,p_carrier_cost_minor+p_service_charge_minor,'DISPATCHED',p_order_id,jsonb_build_object('destination',btrim(p_destination)))
 RETURNING * INTO v_job;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,after_snapshot,notes)
 VALUES(p_organization_id,auth.uid(),'SHIPPING_JOB_CREATED','shipping_jobs',v_id::text,to_jsonb(v_job),'Outbound shipping job created.');
 RETURN to_jsonb(v_job);
END $$;

REVOKE ALL ON FUNCTION public.create_packaging_job(uuid,uuid,date,text,integer,bigint,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_shipping_job(uuid,uuid,date,text,text,text,numeric,bigint,bigint,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_packaging_job(uuid,uuid,date,text,integer,bigint,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_shipping_job(uuid,uuid,date,text,text,text,numeric,bigint,bigint,text,uuid) TO authenticated;
