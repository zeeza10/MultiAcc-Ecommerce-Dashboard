-- Harden marketplace exception resolution and keep trigger-only functions out of the callable API surface.
ALTER FUNCTION public.resolve_marketplace_exception(uuid, uuid, uuid, text, text) SET search_path = '';
ALTER FUNCTION private.resolve_marketplace_exception(uuid, uuid, uuid, text, text) SET search_path = '';

REVOKE ALL ON FUNCTION public.resolve_marketplace_exception(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_marketplace_exception(uuid, uuid, uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION private.resolve_marketplace_exception(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.resolve_marketplace_exception(uuid, uuid, uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION private.set_stock_ledger_marketplace_account() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_marketplace_finance_allocation() FROM PUBLIC, anon, authenticated;
