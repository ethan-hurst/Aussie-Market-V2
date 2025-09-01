-- Add triggers for automatic auction processing

-- Function to automatically end auctions when they expire
CREATE OR REPLACE FUNCTION trigger_end_expired_auctions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only process if this is an update and the auction just became expired
    IF TG_OP = 'UPDATE' AND OLD.status = 'live' AND NEW.status = 'live' THEN
        -- Check if the auction has expired by looking at the listing end time
        IF EXISTS (
            SELECT 1 FROM listings
            WHERE id = NEW.listing_id
            AND end_at <= NOW()
        ) THEN
            -- End the auction automatically
            PERFORM end_auction(NEW.id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger on auctions table
DROP TRIGGER IF EXISTS trigger_auction_expiry ON auctions;
CREATE TRIGGER trigger_auction_expiry
    AFTER UPDATE ON auctions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_end_expired_auctions();

-- Function to create payment intent when auction ends with winner
CREATE OR REPLACE FUNCTION trigger_create_payment_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    order_record RECORD;
    buyer_record RECORD;
    listing_record RECORD;
BEGIN
    -- Only process when an order is created from auction finalization
    IF TG_OP = 'INSERT' AND NEW.auction_id IS NOT NULL AND NEW.state = 'pending_payment' THEN
        -- Get order details
        SELECT * INTO order_record FROM orders WHERE id = NEW.id;
        SELECT * INTO buyer_record FROM users WHERE id = order_record.buyer_id;
        SELECT title INTO listing_record FROM listings WHERE id = order_record.listing_id;

        -- Here we would typically create a Stripe Payment Intent
        -- For now, we'll just log that a payment intent should be created
        -- In production, this would call the Stripe API

        RAISE NOTICE 'Payment intent creation triggered for order %, buyer %, amount % cents',
                   NEW.id, NEW.buyer_id, NEW.amount_cents;

        -- You could also insert a pending payment record here
        INSERT INTO payments (
            order_id,
            amount_cents,
            currency,
            payment_method,
            status,
            created_at
        ) VALUES (
            NEW.id,
            NEW.amount_cents,
            'aud',
            'stripe',
            'pending',
            NOW()
        );

    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger on orders table
DROP TRIGGER IF EXISTS trigger_payment_intent_creation ON orders;
CREATE TRIGGER trigger_payment_intent_creation
    AFTER INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION trigger_create_payment_intent();

-- Function to notify when auction status changes
CREATE OR REPLACE FUNCTION notify_auction_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only notify on status changes
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        -- Insert notification for the auction status change
        -- This is handled in the end_auction function, but we can add additional notifications here if needed

        RAISE NOTICE 'Auction % status changed from % to %',
                   NEW.id, OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger for auction status notifications
DROP TRIGGER IF EXISTS trigger_auction_status_notification ON auctions;
CREATE TRIGGER trigger_auction_status_notification
    AFTER UPDATE ON auctions
    FOR EACH ROW
    EXECUTE FUNCTION notify_auction_status_change();

-- Function to automatically extend auctions with last-minute bids
CREATE OR REPLACE FUNCTION trigger_extend_auction_on_bid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    auction_record RECORD;
    listing_record RECORD;
    time_until_end INTERVAL;
    extension_minutes INTEGER := 5; -- Extend by 5 minutes
BEGIN
    -- Only process new bids
    IF TG_OP = 'INSERT' THEN
        -- Get auction details
        SELECT * INTO auction_record FROM auctions WHERE id = NEW.auction_id;
        SELECT * INTO listing_record FROM listings WHERE id = auction_record.listing_id;

        -- Calculate time until auction ends
        time_until_end := listing_record.end_at - NOW();

        -- If bid is placed within last 10 minutes, extend auction
        IF time_until_end <= INTERVAL '10 minutes' AND time_until_end > INTERVAL '0 minutes' THEN
            -- Extend the auction end time
            UPDATE listings
            SET
                end_at = end_at + (extension_minutes || ' minutes')::INTERVAL,
                updated_at = NOW()
            WHERE id = auction_record.listing_id;

            -- Update auction extension count
            UPDATE auctions
            SET
                extension_count = extension_count + 1,
                updated_at = NOW()
            WHERE id = NEW.auction_id;

            RAISE NOTICE 'Auction % extended by % minutes due to last-minute bid',
                       NEW.auction_id, extension_minutes;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger for auction extension on late bids
DROP TRIGGER IF EXISTS trigger_auction_extension ON bids;
CREATE TRIGGER trigger_auction_extension
    AFTER INSERT ON bids
    FOR EACH ROW
    EXECUTE FUNCTION trigger_extend_auction_on_bid();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION trigger_end_expired_auctions() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_create_payment_intent() TO authenticated;
GRANT EXECUTE ON FUNCTION notify_auction_status_change() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_extend_auction_on_bid() TO authenticated;
