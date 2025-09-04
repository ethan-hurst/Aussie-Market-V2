-- Function to end an auction and create an order
-- This function should be called by a scheduled job or trigger

CREATE OR REPLACE FUNCTION end_auction(auction_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    auction_record RECORD;
    winning_bid RECORD;
    order_id UUID;
    result JSON;
BEGIN
    -- Get auction details
    SELECT * INTO auction_record
    FROM auctions
    WHERE id = auction_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Auction not found');
    END IF;
    
    -- Check if auction is already ended
    IF auction_record.status = 'ended' THEN
        RETURN json_build_object('error', 'Auction already ended');
    END IF;
    
    -- Check if auction has actually ended (past end time)
    IF EXISTS (
        SELECT 1 FROM listings 
        WHERE id = auction_record.listing_id 
        AND end_at > NOW()
    ) THEN
        RETURN json_build_object('error', 'Auction has not ended yet');
    END IF;
    
    -- Get the winning bid
    SELECT * INTO winning_bid
    FROM bids
    WHERE auction_id = auction_id
    ORDER BY amount_cents DESC
    LIMIT 1;
    
    -- Update auction status to ended
    UPDATE auctions
    SET status = 'ended'
    WHERE id = auction_id;
    
    -- If there's a winning bid, create an order
    IF winning_bid IS NOT NULL THEN
        -- Create the order
        INSERT INTO orders (listing_id, buyer_id, seller_id, amount_cents, state)
        SELECT 
            auction_record.listing_id,
            winning_bid.bidder_id,
            l.seller_id,
            winning_bid.amount_cents,
            'pending_payment'
        FROM listings l
        WHERE l.id = auction_record.listing_id
        RETURNING id INTO order_id;
        
        -- Update auction with winning bid info
        UPDATE auctions
        SET 
            high_bid_id = winning_bid.id,
            current_price_cents = winning_bid.amount_cents
        WHERE id = auction_id;
        
        -- Create ledger entry for the sale
        INSERT INTO ledger_entries (order_id, type, description, amount_cents)
        VALUES (order_id, 'auction_sale', 'Auction completed', winning_bid.amount_cents);
        
        RETURN json_build_object(
            'success', true,
            'order_id', order_id,
            'winning_bid_amount', winning_bid.amount_cents,
            'buyer_id', winning_bid.bidder_id
        );
    ELSE
        -- No bids, auction ends without sale
        RETURN json_build_object(
            'success', true,
            'message', 'Auction ended with no bids'
        );
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('error', 'Failed to end auction: ' || SQLERRM);
END;
$$;

-- Function to end all expired auctions
-- This can be called by a scheduled job

CREATE OR REPLACE FUNCTION end_expired_auctions()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    expired_auction RECORD;
    result JSON;
    results JSON[] := '{}';
BEGIN
    -- Find all auctions that should be ended
    FOR expired_auction IN
        SELECT a.id
        FROM auctions a
        JOIN listings l ON a.listing_id = l.id
        WHERE a.status = 'live' 
        AND l.end_at <= NOW()
    LOOP
        -- End each expired auction
        SELECT end_auction(expired_auction.id) INTO result;
        results := array_append(results, result);
    END LOOP;
    
    RETURN json_build_object(
        'success', true,
        'auctions_processed', array_length(results, 1),
        'results', results
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION end_auction(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION end_expired_auctions() TO authenticated;
