-- Remove PostgreSQL's default PUBLIC EXECUTE grant from the public RPC wrapper.
-- Only authenticated callers may invoke it; the private definer implementation
-- still validates auth.uid(), active membership and orders.create permission.
revoke all on function public.create_workspace_order(uuid, jsonb) from public, anon;
grant execute on function public.create_workspace_order(uuid, jsonb) to authenticated;
