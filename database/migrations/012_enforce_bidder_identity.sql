-- Enforce bidder identity inside place_bid to prevent impersonation via direct RPC

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
    -- Identity guard: bidder must match auth.uid()
    IF p_bidder_id IS DISTINCT FROM auth.uid() THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized bidder');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_listing_id::text));

    SELECT * INTO listing_record
    FROM public.listings
    WHERE id = p_listing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Listing not found');
    END IF;

    IF listing_record.status NOT IN ('live', 'active', 'scheduled') THEN
        RETURN json_build_object('success', false, 'error', 'Auction is not active');
    END IF;
    IF NOW() > listing_record.end_at THEN
        RETURN json_build_object('success', false, 'error', 'Auction has ended');
    END IF;

    IF listing_record.seller_id = p_bidder_id THEN
        RETURN json_build_object('success', false, 'error', 'You cannot bid on your own listing');
    END IF;

    SELECT * INTO current_bid_record
    FROM public.bids
    WHERE listing_id = p_listing_id
    ORDER BY amount_cents DESC
    LIMIT 1
    FOR UPDATE;

    IF current_bid_record IS NULL THEN
        actual_bid_amount := GREATEST(p_amount_cents, listing_record.start_cents);
    ELSE
        actual_bid_amount := p_amount_cents;
    END IF;

    IF current_bid_record IS NOT NULL AND actual_bid_amount <= current_bid_record.amount_cents THEN
        RETURN json_build_object('success', false, 'error', 'Bid must be higher than current bid');
    END IF;

    INSERT INTO public.bids (
        listing_id, bidder_id, amount_cents, proxy_max_cents,
        is_proxy_bid, outbid_previous, previous_bidder_id, previous_amount_cents
    ) VALUES (
        p_listing_id, p_bidder_id, actual_bid_amount, p_proxy_max_cents,
        is_proxy, outbid_previous, previous_bidder, previous_amount
    ) RETURNING * INTO new_bid_record;

    BEGIN
      UPDATE public.listings
      SET current_bid_cents = actual_bid_amount,
          bid_count = COALESCE(bid_count, 0) + 1
      WHERE id = p_listing_id;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;

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


