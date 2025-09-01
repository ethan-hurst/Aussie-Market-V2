-- Add auction ending functions for automatic order creation

-- Enhanced function to end an auction and create an order with comprehensive features
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
    platform_fee_cents INTEGER;
    seller_amount_cents INTEGER;
    buyer_record RECORD;
    seller_record RECORD;
    listing_record RECORD;
    result JSON;
BEGIN
    -- Get auction details with listing and bids
    SELECT a.*, l.seller_id, l.title, l.end_at INTO auction_record
    FROM auctions a
    JOIN listings l ON a.listing_id = l.id
    WHERE a.id = auction_id;

    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Auction not found');
    END IF;

    -- Check if auction is already ended or finalized
    IF auction_record.status IN ('ended', 'finalized') THEN
        RETURN json_build_object('error', 'Auction already processed', 'status', auction_record.status);
    END IF;

    -- Check if auction has actually ended (past end time)
    IF auction_record.end_at > NOW() THEN
        RETURN json_build_object('error', 'Auction has not ended yet', 'ends_at', auction_record.end_at);
    END IF;

    -- Get buyer and seller details
    SELECT * INTO seller_record FROM users WHERE id = auction_record.seller_id;

    -- Get the winning bid
    SELECT * INTO winning_bid
    FROM bids
    WHERE auction_id = auction_id
    ORDER BY amount_cents DESC
    LIMIT 1;

    -- Update auction status to ended
    UPDATE auctions
    SET
        status = 'ended',
        updated_at = NOW()
    WHERE id = auction_id;

    -- If there's a winning bid, create an order with full processing
    IF winning_bid IS NOT NULL THEN
        -- Get buyer details
        SELECT * INTO buyer_record FROM users WHERE id = winning_bid.bidder_id;

        -- Calculate fees (5% platform fee)
        platform_fee_cents := (winning_bid.amount_cents * 0.05)::INTEGER;
        seller_amount_cents := winning_bid.amount_cents - platform_fee_cents;

        -- Create the order with comprehensive details
        INSERT INTO orders (
            listing_id,
            buyer_id,
            seller_id,
            amount_cents,
            platform_fee_cents,
            seller_amount_cents,
            state,
            auction_id,
            winning_bid_id
        )
        VALUES (
            auction_record.listing_id,
            winning_bid.bidder_id,
            auction_record.seller_id,
            winning_bid.amount_cents,
            platform_fee_cents,
            seller_amount_cents,
            'pending_payment',
            auction_id,
            winning_bid.id
        )
        RETURNING id INTO order_id;

        -- Update auction with winning bid info
        UPDATE auctions
        SET
            high_bid_id = winning_bid.id,
            current_price_cents = winning_bid.amount_cents,
            status = 'finalized',
            updated_at = NOW()
        WHERE id = auction_id;

        -- Create ledger entries
        INSERT INTO ledger_entries (order_id, user_id, entry_type, description, amount_cents)
        VALUES
            (order_id, winning_bid.bidder_id, 'payment_due', 'Payment due for auction win', winning_bid.amount_cents),
            (order_id, auction_record.seller_id, 'payment_pending', 'Payment pending from auction sale', seller_amount_cents);

        -- Create notifications for buyer and seller
        INSERT INTO notifications (user_id, type, title, message, metadata)
        VALUES
            -- Buyer notification
            (
                winning_bid.bidder_id,
                'auction_won',
                'Congratulations! You won an auction',
                format('You won the auction for "%s" with a bid of $%s. Please complete your payment to secure the item.',
                      auction_record.title, (winning_bid.amount_cents::FLOAT / 100)::TEXT),
                json_build_object('order_id', order_id, 'auction_id', auction_id, 'amount_cents', winning_bid.amount_cents)
            ),
            -- Seller notification
            (
                auction_record.seller_id,
                'auction_ended',
                'Your auction has ended',
                format('Your auction for "%s" has ended with a winning bid of $%s. An order has been created and payment is pending.',
                      auction_record.title, (winning_bid.amount_cents::FLOAT / 100)::TEXT),
                json_build_object('order_id', order_id, 'auction_id', auction_id, 'buyer_id', winning_bid.bidder_id)
            );

        RETURN json_build_object(
            'success', true,
            'order_id', order_id,
            'winning_bid_amount', winning_bid.amount_cents,
            'buyer_id', winning_bid.bidder_id,
            'seller_id', auction_record.seller_id,
            'platform_fee_cents', platform_fee_cents,
            'seller_amount_cents', seller_amount_cents,
            'message', 'Auction finalized with winning bid'
        );
    ELSE
        -- No bids, auction ends without sale
        UPDATE auctions
        SET
            status = 'no_sale',
            updated_at = NOW()
        WHERE id = auction_id;

        -- Notify seller of no-sale
        INSERT INTO notifications (user_id, type, title, message, metadata)
        VALUES (
            auction_record.seller_id,
            'auction_no_sale',
            'Your auction ended with no bids',
            format('Your auction for "%s" has ended without any bids. You may relist the item if desired.',
                  auction_record.title),
            json_build_object('auction_id', auction_id, 'listing_id', auction_record.listing_id)
        );

        RETURN json_build_object(
            'success', true,
            'message', 'Auction ended with no bids',
            'status', 'no_sale'
        );
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and return failure
        RAISE WARNING 'Failed to end auction %: %', auction_id, SQLERRM;
        RETURN json_build_object(
            'error', 'Failed to end auction',
            'details', SQLERRM,
            'auction_id', auction_id
        );
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
