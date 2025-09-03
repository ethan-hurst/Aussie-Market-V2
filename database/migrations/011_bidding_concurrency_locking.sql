-- Improve bidding concurrency control with advisory locks and explicit row locks

-- Helpful index for determining current high bid quickly
CREATE INDEX IF NOT EXISTS idx_bids_listing_amount_desc
ON public.bids (listing_id, amount_cents DESC);

-- Anti-sniping helper (noop if already exists)
DO $$ BEGIN
  PERFORM 1 FROM pg_proc WHERE proname = 'calculate_anti_sniping_extension';
  IF NOT FOUND THEN
    CREATE OR REPLACE FUNCTION calculate_anti_sniping_extension(p_end_at TIMESTAMPTZ)
    RETURNS INTEGER AS $$
    DECLARE remaining INTEGER;
    BEGIN
      remaining := GREATEST(0, CAST(EXTRACT(EPOCH FROM (p_end_at - NOW())) AS INTEGER));
      IF remaining <= 120 THEN -- last 2 minutes
        RETURN 120; -- extend by 2 minutes
      END IF;
      RETURN 0;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  END IF;
END $$;

-- Concurrency-hardened place_bid function (listing-centric)
CREATE OR REPLACE FUNCTION public.place_bid(
    p_listing_id UUID,
    p_bidder_id UUID,
    p_amount_cents INTEGER,
    p_proxy_max_cents INTEGER DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    listing_record RECORD;
    current_bid_record RECORD;
    new_bid_record RECORD;
    extension_seconds INTEGER;
    new_end_at TIMESTAMPTZ;
    actual_bid_amount INTEGER;
    is_proxy BOOLEAN := false;
    outbid_previous BOOLEAN := false;
    previous_bidder UUID;
    previous_amount INTEGER;
    result JSON;
BEGIN
    -- Per-listing advisory lock to serialize bidders on the same listing
    PERFORM pg_advisory_xact_lock(hashtext(p_listing_id::text));

    -- Lock the listing row to prevent concurrent state updates
    SELECT * INTO listing_record
    FROM public.listings
    WHERE id = p_listing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Listing not found');
    END IF;

    -- Listing must be live/active and not ended
    IF listing_record.status NOT IN ('live', 'active', 'scheduled') THEN
        RETURN json_build_object('success', false, 'error', 'Auction is not active');
    END IF;
    IF NOW() > listing_record.end_at THEN
        RETURN json_build_object('success', false, 'error', 'Auction has ended');
    END IF;

    -- Prevent seller self-bidding
    IF listing_record.seller_id = p_bidder_id THEN
        RETURN json_build_object('success', false, 'error', 'You cannot bid on your own listing');
    END IF;

    -- Determine current high bid and lock that row if present
    SELECT * INTO current_bid_record
    FROM public.bids
    WHERE listing_id = p_listing_id
    ORDER BY amount_cents DESC
    LIMIT 1
    FOR UPDATE;

    -- Compute minimum acceptable amount
    IF current_bid_record IS NULL THEN
        actual_bid_amount := GREATEST(p_amount_cents, listing_record.start_cents);
    ELSE
        actual_bid_amount := p_amount_cents;
    END IF;

    IF current_bid_record IS NOT NULL AND actual_bid_amount <= current_bid_record.amount_cents THEN
        RETURN json_build_object('success', false, 'error', 'Bid must be higher than current bid');
    END IF;

    -- Insert bid
    INSERT INTO public.bids (
        listing_id,
        bidder_id,
        amount_cents,
        proxy_max_cents,
        is_proxy_bid,
        outbid_previous,
        previous_bidder_id,
        previous_amount_cents
    ) VALUES (
        p_listing_id,
        p_bidder_id,
        actual_bid_amount,
        p_proxy_max_cents,
        is_proxy,
        outbid_previous,
        previous_bidder,
        previous_amount
    ) RETURNING * INTO new_bid_record;

    -- Update listing snapshot fields if present; ignore if columns absent
    BEGIN
      UPDATE public.listings
      SET current_bid_cents = actual_bid_amount,
          bid_count = COALESCE(bid_count, 0) + 1
      WHERE id = p_listing_id;
    EXCEPTION WHEN undefined_column THEN
      -- schema may not include snapshot columns; ignore
      NULL;
    END;

    -- Anti-sniping extension
    extension_seconds := calculate_anti_sniping_extension(listing_record.end_at);
    IF extension_seconds > 0 THEN
        new_end_at := listing_record.end_at + (extension_seconds || ' seconds')::INTERVAL;
        UPDATE public.listings SET end_at = new_end_at WHERE id = p_listing_id;
    ELSE
        new_end_at := listing_record.end_at;
    END IF;

    result := json_build_object(
        'success', true,
        'bid_id', new_bid_record.id,
        'amount_cents', actual_bid_amount,
        'is_proxy_bid', is_proxy,
        'outbid_previous', outbid_previous,
        'extension_seconds', extension_seconds,
        'new_end_at', new_end_at,
        'previous_bidder_id', previous_bidder,
        'previous_amount_cents', previous_amount
    );
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


