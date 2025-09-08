-- Fix end_auction function - remove references to non-existent updated_at column

DROP FUNCTION IF EXISTS end_auction(UUID);

CREATE FUNCTION end_auction(p_auction_id UUID)
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
BEGIN
    -- Get auction details with listing
    SELECT a.*, l.seller_id, l.title, l.end_at INTO auction_record
    FROM auctions a
    JOIN listings l ON a.listing_id = l.id
    WHERE a.id = p_auction_id;

    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Auction not found');
    END IF;

    -- Already processed?
    IF auction_record.status IN ('ended', 'finalized') THEN
        RETURN json_build_object('error', 'Auction already processed', 'status', auction_record.status);
    END IF;

    -- Has it actually ended?
    IF auction_record.end_at > NOW() THEN
        RETURN json_build_object('error', 'Auction has not ended yet', 'ends_at', auction_record.end_at);
    END IF;

    -- Get the winning bid
    SELECT * INTO winning_bid
    FROM bids
    WHERE bids.auction_id = p_auction_id
    ORDER BY amount_cents DESC
    LIMIT 1;

    -- Mark auction ended
    UPDATE auctions
    SET status = 'ended'
    WHERE id = p_auction_id;

    -- If no bids, mark no_sale and notify seller
    IF winning_bid IS NULL THEN
        UPDATE auctions
        SET status = 'no_sale'
        WHERE id = p_auction_id;

        INSERT INTO notifications (user_id, type, title, message, metadata)
        VALUES (
            auction_record.seller_id,
            'auction_no_sale',
            'Your auction ended with no bids',
            format('Your auction for "%s" has ended without any bids. You may relist the item if desired.', auction_record.title),
            json_build_object('auction_id', p_auction_id, 'listing_id', auction_record.listing_id)
        );

        RETURN json_build_object('success', true, 'status', 'no_sale', 'message', 'Auction ended with no bids');
    END IF;

    -- Calculate fees (5% platform fee)
    platform_fee_cents := (winning_bid.amount_cents * 0.05)::INTEGER;
    seller_amount_cents := winning_bid.amount_cents - platform_fee_cents;

    -- Create order
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
    ) VALUES (
        auction_record.listing_id,
        winning_bid.bidder_id,
        auction_record.seller_id,
        winning_bid.amount_cents,
        platform_fee_cents,
        seller_amount_cents,
        'pending_payment',
        p_auction_id,
        winning_bid.id
    ) RETURNING id INTO order_id;

    -- Update auction summary and finalize
    UPDATE auctions
    SET
        high_bid_id = winning_bid.id,
        current_price_cents = winning_bid.amount_cents,
        status = 'finalized'
    WHERE id = p_auction_id;

    -- Ledger entries
    INSERT INTO ledger_entries (order_id, user_id, entry_type, description, amount_cents)
    VALUES
        (order_id, winning_bid.bidder_id, 'payment_due', 'Payment due for auction win', winning_bid.amount_cents),
        (order_id, auction_record.seller_id, 'payment_pending', 'Payment pending from auction sale', seller_amount_cents);

    -- Notifications
    INSERT INTO notifications (user_id, type, title, message, metadata)
    VALUES
        (
            winning_bid.bidder_id,
            'auction_won',
            'Congratulations! You won an auction',
            format('You won the auction for "%s" with a bid of $%s. Please complete your payment to secure the item.',
                  auction_record.title, (winning_bid.amount_cents::FLOAT / 100)::TEXT),
            json_build_object('order_id', order_id, 'auction_id', p_auction_id, 'amount_cents', winning_bid.amount_cents)
        ),
        (
            auction_record.seller_id,
            'auction_ended',
            'Your auction has ended',
            format('Your auction for "%s" has ended with a winning bid of $%s. An order has been created and payment is pending.',
                  auction_record.title, (winning_bid.amount_cents::FLOAT / 100)::TEXT),
            json_build_object('order_id', order_id, 'auction_id', p_auction_id, 'buyer_id', winning_bid.bidder_id)
        );

    RETURN json_build_object(
        'success', true,
        'order_id', order_id,
        'winning_bid_amount', winning_bid.amount_cents,
        'buyer_id', winning_bid.bidder_id,
        'seller_id', auction_record.seller_id,
        'platform_fee_cents', platform_fee_cents,
        'seller_amount_cents', seller_amount_cents
    );
END;
$$;

GRANT EXECUTE ON FUNCTION end_auction(UUID) TO authenticated;
