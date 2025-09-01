-- Function to place a bid on an auction
-- This function handles bid validation, proxy bidding, and auction updates

CREATE OR REPLACE FUNCTION place_bid(
    auction_id UUID,
    amount_cents INTEGER,
    max_proxy_cents INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    auction_record RECORD;
    current_high_bid RECORD;
    new_bid_id UUID;
    result JSON;
    min_increment INTEGER;
BEGIN
    -- Get auction details
    SELECT * INTO auction_record
    FROM auctions
    WHERE id = auction_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Auction not found');
    END IF;
    
    -- Check if auction is live
    IF auction_record.status != 'live' THEN
        RETURN json_build_object('error', 'Auction is not live');
    END IF;
    
    -- Check if auction has ended
    IF EXISTS (
        SELECT 1 FROM listings 
        WHERE id = auction_record.listing_id 
        AND end_at <= NOW()
    ) THEN
        RETURN json_build_object('error', 'Auction has ended');
    END IF;
    
    -- Get current high bid
    SELECT * INTO current_high_bid
    FROM bids
    WHERE auction_id = auction_id
    ORDER BY amount_cents DESC
    LIMIT 1;
    
    -- Calculate minimum bid increment
    IF current_high_bid IS NULL THEN
        -- First bid, must be at least starting price
        SELECT start_cents INTO min_increment
        FROM listings
        WHERE id = auction_record.listing_id;
    ELSE
        -- Subsequent bids, use increment scheme
        min_increment = current_high_bid.amount_cents + 
            CASE auction_record.increment_scheme
                WHEN 'default' THEN GREATEST(100, current_high_bid.amount_cents / 20) -- 5% or $1 minimum
                ELSE 100 -- Default $1 increment
            END;
    END IF;
    
    -- Validate bid amount
    IF amount_cents < min_increment THEN
        RETURN json_build_object(
            'error', 
            'Bid must be at least ' || (min_increment / 100.0)::TEXT || ' AUD'
        );
    END IF;
    
    -- Check if user is bidding against themselves
    IF current_high_bid IS NOT NULL AND current_high_bid.bidder_id = auth.uid() THEN
        RETURN json_build_object('error', 'You already have the highest bid');
    END IF;
    
    -- Insert the bid
    INSERT INTO bids (auction_id, bidder_id, amount_cents, max_proxy_cents)
    VALUES (auction_id, auth.uid(), amount_cents, max_proxy_cents)
    RETURNING id INTO new_bid_id;
    
    -- Update auction with new high bid
    UPDATE auctions
    SET 
        high_bid_id = new_bid_id,
        current_price_cents = amount_cents,
        reserve_met = CASE 
            WHEN EXISTS (
                SELECT 1 FROM listings 
                WHERE id = auction_record.listing_id 
                AND (reserve_cents IS NULL OR amount_cents >= reserve_cents)
            ) THEN true
            ELSE false
        END
    WHERE id = auction_id;
    
    -- Handle proxy bidding - if there are other bids with higher max_proxy_cents
    -- that are now outbid, place their proxy bids
    PERFORM process_proxy_bids(auction_id);
    
    -- Return success
    RETURN json_build_object(
        'success', true,
        'bid_id', new_bid_id,
        'amount_cents', amount_cents
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('error', 'Failed to place bid: ' || SQLERRM);
END;
$$;

-- Function to process proxy bids
CREATE OR REPLACE FUNCTION process_proxy_bids(auction_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    proxy_bid RECORD;
    current_high_bid RECORD;
    min_increment INTEGER;
    new_amount INTEGER;
BEGIN
    -- Get current high bid
    SELECT * INTO current_high_bid
    FROM bids
    WHERE auction_id = auction_id
    ORDER BY amount_cents DESC
    LIMIT 1;
    
    -- Find proxy bids that can be increased
    FOR proxy_bid IN
        SELECT * FROM bids
        WHERE auction_id = auction_id
        AND max_proxy_cents IS NOT NULL
        AND max_proxy_cents > amount_cents
        AND bidder_id != current_high_bid.bidder_id
        ORDER BY max_proxy_cents DESC
    LOOP
        -- Calculate minimum increment
        min_increment = current_high_bid.amount_cents + 
            CASE (SELECT increment_scheme FROM auctions WHERE id = auction_id)
                WHEN 'default' THEN GREATEST(100, current_high_bid.amount_cents / 20)
                ELSE 100
            END;
        
        -- Calculate new bid amount (minimum of max_proxy_cents and min_increment)
        new_amount = LEAST(proxy_bid.max_proxy_cents, min_increment);
        
        -- Update the proxy bid
        UPDATE bids
        SET amount_cents = new_amount
        WHERE id = proxy_bid.id;
        
        -- Update auction if this becomes the new high bid
        IF new_amount > current_high_bid.amount_cents THEN
            UPDATE auctions
            SET 
                high_bid_id = proxy_bid.id,
                current_price_cents = new_amount
            WHERE id = auction_id;
            
            -- Update current_high_bid for next iteration
            current_high_bid.id := proxy_bid.id;
            current_high_bid.amount_cents := new_amount;
            current_high_bid.bidder_id := proxy_bid.bidder_id;
        END IF;
    END LOOP;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION place_bid(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION process_proxy_bids(UUID) TO authenticated;
