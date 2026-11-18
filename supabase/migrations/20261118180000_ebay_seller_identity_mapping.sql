-- Store eBay's immutable public user ID separately from the mutable seller username.
-- This allows account-deletion notifications to be matched without username guessing.
ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS ebay_user_id text;

CREATE INDEX IF NOT EXISTS marketplace_accounts_ebay_user_id_idx
  ON public.marketplace_accounts (environment, ebay_user_id)
  WHERE ebay_user_id IS NOT NULL;

COMMENT ON COLUMN public.marketplace_accounts.ebay_user_id IS
  'Immutable public eBay user ID returned by the Identity API; used only for exact account-deletion notification matching.';
