-- Unify bid RPC to auctions-centric signature with compatibility wrapper

-- Drop prior auctions-centric signature to redefine cleanly
DROP FUNCTION IF EXISTS public.place_bid(UUID, INTEGER, INTEGER);

-- Canonical auctions-centric function
CREATE OR REPLACE FUNCTION public.place_bid(
  auction_id UUID,
  amount_cents INTEGER,
  max_proxy_cents INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  auction_rec RECORD;
  listing_rec RECORD;
  current_high_bid RECORD;
  new_bid RECORD;
  actual_amount INTEGER;
  extension_seconds INTEGER;
  new_end_at TIMESTAMPTZ;
BEGIN
  -- Load auction and associated listing (lock listing to prevent race on end_at updates)
  SELECT * INTO auction_rec FROM public.auctions WHERE id = auction_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Auction not found');
  END IF;

  SELECT * INTO listing_rec FROM public.listings WHERE id = auction_rec.listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Listing not found');
  END IF;

  -- Basic state checks
  IF listing_rec.status NOT IN ('live', 'active', 'scheduled') THEN
    RETURN json_build_object('success', false, 'error', 'Auction is not active');
  END IF;
  IF NOW() > listing_rec.end_at THEN
    RETURN json_build_object('success', false, 'error', 'Auction has ended');
  END IF;

  -- Determine current high bid
  SELECT * INTO current_high_bid
  FROM public.bids
  WHERE auction_id = auction_id
  ORDER BY amount_cents DESC
  LIMIT 1
  FOR UPDATE;

  IF current_high_bid IS NULL THEN
    actual_amount := GREATEST(amount_cents, listing_rec.start_cents);
  ELSE
    -- Must exceed current high
    IF amount_cents <= current_high_bid.amount_cents THEN
      RETURN json_build_object('success', false, 'error', 'Bid must be higher than current bid');
    END IF;
    actual_amount := amount_cents;
  END IF;

  -- Insert bid
  INSERT INTO public.bids (auction_id, bidder_id, amount_cents, max_proxy_cents, accepted)
  VALUES (auction_id, auth.uid(), actual_amount, max_proxy_cents, true)
  RETURNING * INTO new_bid;

  -- Update auction snapshot
  UPDATE public.auctions
  SET current_price_cents = new_bid.amount_cents,
      high_bid_id = new_bid.id
  WHERE id = auction_id;

  -- Update listing snapshot when columns exist
  BEGIN
    UPDATE public.listings
    SET current_bid_cents = new_bid.amount_cents,
        bid_count = COALESCE(bid_count, 0) + 1
    WHERE id = auction_rec.listing_id;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- Anti-sniping extension (best-effort)
  BEGIN
    extension_seconds := calculate_anti_sniping_extension(listing_rec.end_at);
  EXCEPTION WHEN undefined_function THEN
    extension_seconds := 0;
  END;
  IF extension_seconds > 0 THEN
    new_end_at := listing_rec.end_at + (extension_seconds || ' seconds')::INTERVAL;
    UPDATE public.listings SET end_at = new_end_at WHERE id = auction_rec.listing_id;
  ELSE
    new_end_at := listing_rec.end_at;
  END IF;

  RETURN json_build_object(
    'success', true,
    'bid_id', new_bid.id,
    'amount_cents', new_bid.amount_cents,
    'extension_seconds', extension_seconds,
    'new_end_at', new_end_at
  );
END;
$$;

-- Backwards-compatible wrapper for listing-centric callers
CREATE OR REPLACE FUNCTION public.place_bid(
  p_listing_id UUID,
  p_bidder_id UUID,
  p_amount_cents INTEGER,
  p_proxy_max_cents INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  auc_id UUID;
BEGIN
  -- Identity guard
  IF p_bidder_id IS DISTINCT FROM auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized bidder');
  END IF;

  SELECT id INTO auc_id FROM public.auctions WHERE listing_id = p_listing_id;
  IF auc_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Auction not found for listing');
  END IF;

  RETURN public.place_bid(auc_id, p_amount_cents, p_proxy_max_cents);
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.place_bid(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_bid(UUID, UUID, INTEGER, INTEGER) TO authenticated;


