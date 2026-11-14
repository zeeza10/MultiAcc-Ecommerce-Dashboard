-- Provision a usable baseline chart of accounts and receiving location
-- whenever a new workspace is created. All rows remain organization-scoped.

create or replace function private.bootstrap_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_role_id uuid;
  v_warehouse_id uuid;
  v_currency char(3);
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Organization name must be between 2 and 120 characters' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$' or length(v_slug) > 60 then
    raise exception 'Organization slug must contain lowercase letters, numbers, and internal hyphens only' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.organization_members
    where user_id = v_user_id and is_active = true
  ) then
    raise exception 'This account already belongs to an organization. Ask an organization administrator for an invitation.' using errcode = '23505';
  end if;

  select id into v_role_id from public.roles
  where organization_id is null and code = 'SUPER_ADMIN' and is_system = true limit 1;
  if v_role_id is null then
    raise exception 'System administrator role is not configured';
  end if;

  insert into public.organizations(name, slug)
  values (v_name, v_slug)
  returning id into v_org_id;

  insert into public.organization_members(organization_id, user_id, role_id, is_active)
  values (v_org_id, v_user_id, v_role_id, true);

  insert into public.system_settings(organization_id)
  values (v_org_id);

  select coalesce(base_currency, 'GBP')
  into v_currency
  from public.system_settings
  where organization_id = v_org_id;

  insert into public.chart_of_accounts(
    organization_id, account_code, account_name, account_type, currency, is_active
  )
  values
    (v_org_id, '1000', 'Operating Bank Account', 'ASSET', v_currency, true),
    (v_org_id, '1100', 'Marketplace Clearing (eBay UK)', 'ASSET', v_currency, true),
    (v_org_id, '1200', 'Accounts Receivable', 'ASSET', v_currency, true),
    (v_org_id, '1250', 'Marketplace Settlement Clearing', 'ASSET', v_currency, true),
    (v_org_id, '1300', 'Inventory Asset', 'ASSET', v_currency, true),
    (v_org_id, '2000', 'Accounts Payable', 'LIABILITY', v_currency, true),
    (v_org_id, '2050', 'Goods Received Not Invoiced (GRNI)', 'LIABILITY', v_currency, true),
    (v_org_id, '4000', 'Sales Revenue', 'REVENUE', v_currency, true),
    (v_org_id, '4100', 'Sales Returns & Allowances', 'CONTRA_REVENUE', v_currency, true),
    (v_org_id, '5000', 'Cost of Goods Sold (COGS)', 'EXPENSE', v_currency, true)
  on conflict (organization_id, account_code) do nothing;

  insert into public.warehouses(
    organization_id, name, code, address, is_active
  ) values (
    v_org_id, 'Main Warehouse', 'WH-01',
    jsonb_build_object('formatted', 'Main Warehouse'), true
  ) returning id into v_warehouse_id;

  insert into public.warehouse_locations(
    organization_id, warehouse_id, location_code, location_type,
    zone, aisle, shelf, bin, capacity_units, is_active
  ) values (
    v_org_id, v_warehouse_id, '000-RECEIVING', 'RECEIVING',
    'Receiving', null, null, null, 0, true
  );

  insert into public.warehouse_locations(
    organization_id, warehouse_id, location_code, location_type,
    zone, aisle, shelf, bin, capacity_units, is_active
  ) values (
    v_org_id, v_warehouse_id, '999-QUARANTINE', 'QUARANTINE',
    'Quarantine', null, null, null, 0, true
  );

  return v_org_id;
end;
$function$;


-- Add a segregated quarantine destination to existing default warehouses.
insert into public.warehouse_locations(
  organization_id, warehouse_id, location_code, location_type,
  zone, aisle, shelf, bin, capacity_units, is_active
)
select w.organization_id, w.id, '999-QUARANTINE', 'QUARANTINE',
       'Quarantine', null, null, null, 0, true
from public.warehouses w
where w.code = 'WH-01'
  and not exists (
    select 1 from public.warehouse_locations l
    where l.warehouse_id = w.id and l.location_code = '999-QUARANTINE'
  );
