-- Resolve an unmapped marketplace SKU and its exception in one audited transaction.
create or replace function private.resolve_marketplace_exception(
  p_organization_id uuid,
  p_exception_id uuid,
  p_product_id uuid,
  p_external_sku text,
  p_resolution_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_exception public.marketplace_exceptions%rowtype;
  v_account public.marketplace_accounts%rowtype;
  v_product public.products%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_external_sku text := btrim(coalesce(p_external_sku, ''));
  v_note text := nullif(btrim(coalesce(p_resolution_note, '')), '');
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_organization_id is null
     or not private.has_org_permission(p_organization_id, 'marketplace.manage')
     or not private.has_org_permission(p_organization_id, 'products.create') then
    raise exception 'You are not authorized to manage marketplace SKU mappings in this workspace.' using errcode = '42501';
  end if;

  if p_exception_id is null or p_product_id is null
     or v_external_sku = '' or length(v_external_sku) > 128 then
    raise exception 'A valid exception, product and marketplace SKU are required.' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 500 then
    raise exception 'Resolution notes must be 500 characters or fewer.' using errcode = '22023';
  end if;

  select * into v_exception
  from public.marketplace_exceptions e
  where e.id = p_exception_id and e.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Marketplace exception was not found in this workspace.' using errcode = 'P0002';
  end if;
  if v_exception.status <> 'PENDING' or v_exception.exception_type <> 'UNMAPPED_SKU' then
    raise exception 'Only pending unmapped SKU exceptions can be resolved.' using errcode = '55000';
  end if;
  if v_exception.marketplace_account_id is null then
    raise exception 'The marketplace exception is not linked to an account.' using errcode = '22023';
  end if;

  select * into v_account
  from public.marketplace_accounts a
  where a.id = v_exception.marketplace_account_id
    and a.organization_id = p_organization_id
  for share;
  if not found then
    raise exception 'Marketplace account was not found in this workspace.' using errcode = '42501';
  end if;

  select * into v_product
  from public.products p
  where p.id = p_product_id
    and p.organization_id = p_organization_id
    and p.status = 'ACTIVE'
  for share;
  if not found then
    raise exception 'Select an active product from this workspace.' using errcode = 'P0002';
  end if;

  v_before := to_jsonb(v_exception);

  insert into public.marketplace_sku_mappings(
    organization_id, product_id, marketplace_account_id, external_sku, is_verified
  ) values (
    p_organization_id, v_product.id, v_account.id, v_external_sku, true
  )
  on conflict (marketplace_account_id, external_sku)
  do update set
    product_id = excluded.product_id,
    is_verified = true;

  update public.marketplace_exceptions
  set status = 'RESOLVED',
      resolved_at = v_now,
      resolved_by = v_actor,
      resolution_note = v_note
  where id = v_exception.id and organization_id = p_organization_id
  returning * into v_exception;

  v_after := to_jsonb(v_exception) || jsonb_build_object(
    'external_sku', v_external_sku,
    'product_id', v_product.id,
    'product_sku', v_product.sku
  );

  insert into public.audit_logs(
    organization_id, actor_id, action, entity, entity_id,
    before_snapshot, after_snapshot, notes
  ) values (
    p_organization_id, v_actor, 'UPDATE', 'Marketplace Exception', v_exception.id::text,
    v_before, v_after,
    coalesce(v_note, 'Marketplace SKU mapped to internal product ' || v_product.sku)
  );

  return jsonb_build_object(
    'id', v_exception.id,
    'status', v_exception.status,
    'resolvedAt', v_exception.resolved_at,
    'resolvedBy', v_exception.resolved_by,
    'resolutionNote', coalesce(v_exception.resolution_note, ''),
    'marketplaceAccountId', v_account.id,
    'externalSku', v_external_sku,
    'productId', v_product.id,
    'productSku', v_product.sku
  );
end;
$function$;

create or replace function public.resolve_marketplace_exception(
  p_organization_id uuid,
  p_exception_id uuid,
  p_product_id uuid,
  p_external_sku text,
  p_resolution_note text default null
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.resolve_marketplace_exception(
    p_organization_id, p_exception_id, p_product_id, p_external_sku, p_resolution_note
  );
$function$;

grant usage on schema private to authenticated;
grant execute on function private.resolve_marketplace_exception(uuid, uuid, uuid, text, text) to authenticated;
revoke all on function private.resolve_marketplace_exception(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.resolve_marketplace_exception(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.resolve_marketplace_exception(uuid, uuid, uuid, text, text) to authenticated;
