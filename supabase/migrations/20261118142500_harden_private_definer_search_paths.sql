-- Remove unnecessary trusted-schema lookup from SECURITY DEFINER functions.
-- Every relation and application helper referenced by these functions is schema-qualified.
-- pg_catalog remains implicitly available; user-controlled schemas are not searched.
-- This does not change function bodies, grants, or business behavior.

ALTER FUNCTION private.allocate_marketplace_finance(uuid, uuid, text, uuid, bigint, character, text) SET search_path = '';
ALTER FUNCTION private.confirm_payout_deposit(uuid, uuid, text) SET search_path = '';
ALTER FUNCTION private.create_packaging_job(uuid, uuid, date, text, integer, bigint, uuid, text) SET search_path = '';
ALTER FUNCTION private.create_shipping_job(uuid, uuid, date, text, text, text, numeric, bigint, bigint, text, uuid) SET search_path = '';
ALTER FUNCTION private.current_user_client_id(uuid) SET search_path = '';
ALTER FUNCTION private.get_client_finance_payments(uuid) SET search_path = '';
ALTER FUNCTION private.is_client_user(uuid) SET search_path = '';
ALTER FUNCTION private.record_finance_payment(uuid, uuid, bigint, text, date, text, text) SET search_path = '';
ALTER FUNCTION private.set_marketplace_inventory_allocation(uuid, uuid, uuid, integer, integer, text) SET search_path = '';
ALTER FUNCTION private.void_finance_invoice(uuid, uuid, text) SET search_path = '';
