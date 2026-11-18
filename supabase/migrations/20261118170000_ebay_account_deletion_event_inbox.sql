-- Store verified eBay account-deletion notifications as an encrypted, idempotent inbox.
-- The service role is the only role permitted to read or write this table.
CREATE TABLE public.ebay_account_deletion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id text NOT NULL UNIQUE,
  public_key_id text NOT NULL,
  encrypted_payload text NOT NULL,
  processing_status text NOT NULL DEFAULT 'PENDING'
    CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ebay_account_deletion_events_pending_idx
  ON public.ebay_account_deletion_events (received_at)
  WHERE processing_status IN ('PENDING', 'FAILED', 'NEEDS_REVIEW');

ALTER TABLE public.ebay_account_deletion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebay_account_deletion_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ebay_account_deletion_events FROM anon, authenticated;
GRANT ALL ON TABLE public.ebay_account_deletion_events TO service_role;

COMMENT ON TABLE public.ebay_account_deletion_events IS
  'Encrypted, signature-verified eBay Marketplace Account Deletion webhook inbox. Payload must only be processed by the controlled server-side erasure workflow.';
