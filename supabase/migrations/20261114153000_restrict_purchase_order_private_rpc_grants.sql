-- Restrict private purchase-order SECURITY DEFINER implementations to authenticated users.
-- PUBLIC otherwise inherits EXECUTE on newly created PostgreSQL functions by default.
revoke all on function private.create_workspace_purchase_order(uuid, jsonb, text) from public, anon;
revoke all on function private.approve_workspace_purchase_order(uuid, uuid) from public, anon;

grant usage on schema private to authenticated;
grant execute on function private.create_workspace_purchase_order(uuid, jsonb, text) to authenticated;
grant execute on function private.approve_workspace_purchase_order(uuid, uuid) to authenticated;
