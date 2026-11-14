-- Keep SECURITY DEFINER implementations in the non-exposed private schema.
-- Public RPC wrappers are SECURITY INVOKER and only delegate to guarded internals.
grant usage on schema private to authenticated;

grant execute on function private.create_workspace_order(uuid, jsonb) to authenticated;
grant execute on function private.transition_workspace_order(uuid, uuid, text, jsonb) to authenticated;
grant execute on function private.receive_workspace_purchase_order(uuid, uuid, jsonb, text, text) to authenticated;

create or replace function public.create_workspace_order(
  p_organization_id uuid,
  p_order jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.create_workspace_order(p_organization_id, p_order);
$function$;

create or replace function public.transition_workspace_order(
  p_organization_id uuid,
  p_order_id uuid,
  p_target_status text,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.transition_workspace_order(p_organization_id, p_order_id, p_target_status, p_options);
$function$;

create or replace function public.receive_workspace_purchase_order(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_items jsonb,
  p_discrepancy_note text,
  p_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.receive_workspace_purchase_order(
    p_organization_id, p_purchase_order_id, p_items, p_discrepancy_note, p_idempotency_key
  );
$function$;

revoke all on function public.create_workspace_order(uuid, jsonb) from public, anon;
revoke all on function public.transition_workspace_order(uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.receive_workspace_purchase_order(uuid, uuid, jsonb, text, text) from public, anon;

grant execute on function public.create_workspace_order(uuid, jsonb) to authenticated;
grant execute on function public.transition_workspace_order(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.receive_workspace_purchase_order(uuid, uuid, jsonb, text, text) to authenticated;
