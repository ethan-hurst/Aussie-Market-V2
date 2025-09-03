-- Add address verification fields to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS address_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS address_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS address_verification_method TEXT, -- identity|poa|mail
  ADD COLUMN IF NOT EXISTS address_normalized JSONB;

-- Helper to normalize AU addresses (very simple normalization)
CREATE OR REPLACE FUNCTION normalize_au_address(addr JSONB)
RETURNS JSONB AS $$
BEGIN
  IF addr IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'street', trim(lower((addr->>'street'))),
    'suburb', trim(lower((addr->>'suburb'))),
    'postcode', trim((addr->>'postcode')),
    'state', upper(trim((addr->>'state'))),
    'country', 'AU'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_users_address_normalized ON public.users USING GIN (address_normalized);


