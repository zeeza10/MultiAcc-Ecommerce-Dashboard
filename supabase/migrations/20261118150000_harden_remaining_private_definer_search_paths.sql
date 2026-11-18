-- Pin every remaining private SECURITY DEFINER function to an empty search_path.
-- Application relations and helper functions in these bodies are schema-qualified.
-- Built-in objects remain available through implicit pg_catalog lookup.
-- This prevents future object-shadowing through public/private/temp schemas.
-- No function body, grants, trigger wiring, or business behavior is changed.

ALTER FUNCTION private.approve_workspace_purchase_order(uuid, uuid) SET search_path = '';
ALTER FUNCTION private.bootstrap_organization(text, text) SET search_path = '';
ALTER FUNCTION private.create_workspace_order(uuid, jsonb) SET search_path = '';
ALTER FUNCTION private.create_workspace_purchase_order(uuid, jsonb, text) SET search_path = '';
ALTER FUNCTION private.decide_stock_adjustment(uuid, uuid, text, text) SET search_path = '';
ALTER FUNCTION private.handle_new_auth_user() SET search_path = '';
ALTER FUNCTION private.is_org_member(uuid) SET search_path = '';
ALTER FUNCTION private.process_workspace_return_disposition(uuid, uuid, jsonb, boolean, text) SET search_path = '';
ALTER FUNCTION private.receive_workspace_purchase_order(uuid, uuid, jsonb, text, text) SET search_path = '';
ALTER FUNCTION private.submit_stock_adjustment(uuid, uuid, uuid, integer, text, text, text) SET search_path = '';
ALTER FUNCTION private.transition_workspace_order(uuid, uuid, text, jsonb) SET search_path = '';
ALTER FUNCTION private.update_workspace_order(uuid, uuid, jsonb) SET search_path = '';
