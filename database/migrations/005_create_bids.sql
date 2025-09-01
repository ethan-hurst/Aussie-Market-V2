-- Create bids table
CREATE TABLE IF NOT EXISTS public.bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    bidder_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 100), -- Minimum $1.00
    proxy_max_cents INTEGER CHECK (proxy_max_cents >= amount_cents),
    is_proxy_bid BOOLEAN NOT NULL DEFAULT false,
    outbid_previous BOOLEAN NOT NULL DEFAULT false,
    previous_bidder_id UUID REFERENCES public.users(id),
    previous_amount_cents INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bids_listing_id ON public.bids(listing_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder_id ON public.bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_bids_amount_cents ON public.bids(amount_cents DESC);
CREATE INDEX IF NOT EXISTS idx_bids_created_at ON public.bids(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bids_listing_bidder_unique ON public.bids(listing_id, bidder_id, amount_cents);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_bids_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bids_updated_at
    BEFORE UPDATE ON public.bids
    FOR EACH ROW
    EXECUTE FUNCTION update_bids_updated_at();

-- Row Level Security (RLS) policies
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all bids on active listings
CREATE POLICY "Users can view bids on active listings" ON public.bids
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.listings
            WHERE id = listing_id
            AND status = 'active'
        )
    );

-- Policy: Users can view their own bids
CREATE POLICY "Users can view own bids" ON public.bids
    FOR SELECT
    USING (auth.uid() = bidder_id);

-- Policy: KYC-verified users can place bids
CREATE POLICY "KYC-verified users can place bids" ON public.bids
    FOR INSERT
    WITH CHECK (
        auth.uid() = bidder_id AND
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND kyc = 'passed'
        ) AND
        EXISTS (
            SELECT 1 FROM public.listings
            WHERE id = listing_id
            AND status = 'active'
            AND seller_id != auth.uid()
            AND end_at > NOW()
        )
    );

-- Functions for bid management
CREATE OR REPLACE FUNCTION get_current_bid(listing_id UUID)
RETURNS TABLE (
    id UUID,
    bidder_id UUID,
    amount_cents INTEGER,
    proxy_max_cents INTEGER,
    is_proxy_bid BOOLEAN,
    created_at TIMESTAMPTZ,
    bidder_legal_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.bidder_id,
        b.amount_cents,
        b.proxy_max_cents,
        b.is_proxy_bid,
        b.created_at,
        u.legal_name as bidder_legal_name
    FROM public.bids b
    JOIN public.users u ON b.bidder_id = u.id
    WHERE b.listing_id = listing_id
    ORDER BY b.amount_cents DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate bid increment
CREATE OR REPLACE FUNCTION calculate_bid_increment(current_bid_cents INTEGER)
RETURNS INTEGER AS $$
BEGIN
    -- Bid increment table
    IF current_bid_cents < 1000 THEN
        RETURN 50; -- $0-$9.99: $0.50 increments
    ELSIF current_bid_cents < 5000 THEN
        RETURN 100; -- $10-$49.99: $1.00 increments
    ELSIF current_bid_cents < 10000 THEN
        RETURN 250; -- $50-$99.99: $2.50 increments
    ELSIF current_bid_cents < 25000 THEN
        RETURN 500; -- $100-$249.99: $5.00 increments
    ELSIF current_bid_cents < 50000 THEN
        RETURN 1000; -- $250-$499.99: $10.00 increments
    ELSIF current_bid_cents < 100000 THEN
        RETURN 2500; -- $500-$999.99: $25.00 increments
    ELSIF current_bid_cents < 250000 THEN
        RETURN 5000; -- $1000-$2499.99: $50.00 increments
    ELSIF current_bid_cents < 500000 THEN
        RETURN 10000; -- $2500-$4999.99: $100.00 increments
    ELSE
        RETURN 25000; -- $5000+: $250.00 increments
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate minimum bid
CREATE OR REPLACE FUNCTION calculate_minimum_bid(current_bid_cents INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN current_bid_cents + calculate_bid_increment(current_bid_cents);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate anti-sniping extension
CREATE OR REPLACE FUNCTION calculate_anti_sniping_extension(end_at TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
    seconds_remaining INTEGER;
BEGIN
    seconds_remaining := EXTRACT(EPOCH FROM (end_at - NOW()));
    
    -- Anti-sniping rules
    IF seconds_remaining <= 300 THEN -- Last 5 minutes
        RETURN 300; -- Extend by 5 minutes
    ELSIF seconds_remaining <= 600 THEN -- Last 10 minutes
        RETURN 180; -- Extend by 3 minutes
    ELSIF seconds_remaining <= 1800 THEN -- Last 30 minutes
        RETURN 60; -- Extend by 1 minute
    ELSE
        RETURN 0; -- No extension
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Main place_bid RPC function with concurrency safety
CREATE OR REPLACE FUNCTION place_bid(
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
    -- Start transaction with FOR UPDATE lock on listing
    BEGIN
        -- Get listing with FOR UPDATE lock
        SELECT * INTO listing_record
        FROM public.listings
        WHERE id = p_listing_id
        FOR UPDATE;
        
        IF NOT FOUND THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Listing not found'
            );
        END IF;
        
        -- Check if listing is active
        IF listing_record.status != 'active' THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Auction is not active'
            );
        END IF;
        
        -- Check if auction has ended
        IF NOW() > listing_record.end_at THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Auction has ended'
            );
        END IF;
        
        -- Check if bidder is the seller
        IF listing_record.seller_id = p_bidder_id THEN
            RETURN json_build_object(
                'success', false,
                'error', 'You cannot bid on your own listing'
            );
        END IF;
        
        -- Get current highest bid
        SELECT * INTO current_bid_record
        FROM public.bids
        WHERE listing_id = p_listing_id
        ORDER BY amount_cents DESC
        LIMIT 1;
        
        -- Calculate minimum bid
        IF current_bid_record IS NULL THEN
            -- No bids yet, minimum is starting price
            actual_bid_amount := GREATEST(p_amount_cents, listing_record.start_cents);
        ELSE
            -- Check if this bid would outbid the current highest
            IF current_bid_record.bidder_id = p_bidder_id THEN
                RETURN json_build_object(
                    'success', false,
                    'error', 'You are already the highest bidder'
                );
            END IF;
            
            -- Calculate minimum bid amount
            DECLARE
                min_bid INTEGER := calculate_minimum_bid(current_bid_record.amount_cents);
            BEGIN
                IF p_amount_cents < min_bid THEN
                    RETURN json_build_object(
                        'success', false,
                        'error', format('Minimum bid is $%s', (min_bid::DECIMAL / 100)::TEXT),
                        'minimum_bid_cents', min_bid
                    );
                END IF;
                
                actual_bid_amount := p_amount_cents;
                outbid_previous := true;
                previous_bidder := current_bid_record.bidder_id;
                previous_amount := current_bid_record.amount_cents;
            END;
        END IF;
        
        -- Check reserve price
        IF listing_record.reserve_cents IS NOT NULL AND actual_bid_amount < listing_record.reserve_cents THEN
            RETURN json_build_object(
                'success', false,
                'error', format('Bid must meet reserve price of $%s', (listing_record.reserve_cents::DECIMAL / 100)::TEXT),
                'reserve_cents', listing_record.reserve_cents
            );
        END IF;
        
        -- Handle proxy bidding
        IF p_proxy_max_cents IS NOT NULL AND p_proxy_max_cents > actual_bid_amount THEN
            is_proxy := true;
            actual_bid_amount := p_proxy_max_cents;
        END IF;
        
        -- Insert the bid
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
        
        -- Update listing with new current bid and bid count
        UPDATE public.listings
        SET 
            current_bid_cents = actual_bid_amount,
            bid_count = bid_count + 1
        WHERE id = p_listing_id;
        
        -- Check for anti-sniping extension
        extension_seconds := calculate_anti_sniping_extension(listing_record.end_at);
        IF extension_seconds > 0 THEN
            new_end_at := listing_record.end_at + (extension_seconds || ' seconds')::INTERVAL;
            UPDATE public.listings
            SET end_at = new_end_at
            WHERE id = p_listing_id;
        ELSE
            new_end_at := listing_record.end_at;
        END IF;
        
        -- Return success response
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
        
    EXCEPTION
        WHEN OTHERS THEN
            -- Rollback transaction on error
            RAISE EXCEPTION 'Bid placement failed: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get bid history
CREATE OR REPLACE FUNCTION get_bid_history(listing_id UUID, limit_count INTEGER DEFAULT 50)
RETURNS TABLE (
    id UUID,
    bidder_id UUID,
    amount_cents INTEGER,
    proxy_max_cents INTEGER,
    is_proxy_bid BOOLEAN,
    outbid_previous BOOLEAN,
    created_at TIMESTAMPTZ,
    bidder_legal_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.bidder_id,
        b.amount_cents,
        b.proxy_max_cents,
        b.is_proxy_bid,
        b.outbid_previous,
        b.created_at,
        u.legal_name as bidder_legal_name
    FROM public.bids b
    JOIN public.users u ON b.bidder_id = u.id
    WHERE b.listing_id = listing_id
    ORDER BY b.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's bids
CREATE OR REPLACE FUNCTION get_user_bids(user_id UUID)
RETURNS TABLE (
    id UUID,
    listing_id UUID,
    amount_cents INTEGER,
    proxy_max_cents INTEGER,
    is_proxy_bid BOOLEAN,
    outbid_previous BOOLEAN,
    created_at TIMESTAMPTZ,
    listing_title TEXT,
    listing_end_at TIMESTAMPTZ,
    listing_status TEXT,
    is_winning BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.listing_id,
        b.amount_cents,
        b.proxy_max_cents,
        b.is_proxy_bid,
        b.outbid_previous,
        b.created_at,
        l.title as listing_title,
        l.end_at as listing_end_at,
        l.status as listing_status,
        (b.amount_cents = l.current_bid_cents) as is_winning
    FROM public.bids b
    JOIN public.listings l ON b.listing_id = l.id
    WHERE b.bidder_id = user_id
    ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is winning
CREATE OR REPLACE FUNCTION is_user_winning(user_id UUID, listing_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    highest_bidder UUID;
BEGIN
    SELECT bidder_id INTO highest_bidder
    FROM public.bids
    WHERE listing_id = is_user_winning.listing_id
    ORDER BY amount_cents DESC
    LIMIT 1;
    
    RETURN highest_bidder = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get auction statistics
CREATE OR REPLACE FUNCTION get_auction_stats(listing_id UUID)
RETURNS TABLE (
    total_bids INTEGER,
    unique_bidders INTEGER,
    highest_bid_cents INTEGER,
    time_remaining_seconds BIGINT,
    is_ended BOOLEAN,
    reserve_met BOOLEAN
) AS $$
DECLARE
    listing_record RECORD;
BEGIN
    SELECT * INTO listing_record FROM public.listings WHERE id = listing_id;
    
    RETURN QUERY
    SELECT 
        COALESCE(bid_stats.total_bids, 0),
        COALESCE(bid_stats.unique_bidders, 0),
        COALESCE(bid_stats.highest_bid_cents, 0),
        EXTRACT(EPOCH FROM (listing_record.end_at - NOW())),
        NOW() > listing_record.end_at,
        COALESCE(bid_stats.highest_bid_cents, 0) >= COALESCE(listing_record.reserve_cents, 0)
    FROM (
        SELECT 
            COUNT(*) as total_bids,
            COUNT(DISTINCT bidder_id) as unique_bidders,
            MAX(amount_cents) as highest_bid_cents
        FROM public.bids
        WHERE listing_id = get_auction_stats.listing_id
    ) bid_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE public.bids IS 'Bids placed on auction listings';
COMMENT ON COLUMN public.bids.amount_cents IS 'Bid amount in cents';
COMMENT ON COLUMN public.bids.proxy_max_cents IS 'Maximum proxy bid amount in cents';
COMMENT ON COLUMN public.bids.is_proxy_bid IS 'Whether this is a proxy bid';
COMMENT ON COLUMN public.bids.outbid_previous IS 'Whether this bid outbid a previous bidder';
COMMENT ON COLUMN public.bids.previous_bidder_id IS 'ID of the previously highest bidder';
COMMENT ON COLUMN public.bids.previous_amount_cents IS 'Amount of the previous highest bid';

COMMENT ON FUNCTION place_bid IS 'Place a bid on an auction with concurrency safety and anti-sniping';
COMMENT ON FUNCTION calculate_bid_increment IS 'Calculate minimum bid increment based on current bid amount';
COMMENT ON FUNCTION calculate_minimum_bid IS 'Calculate minimum next bid amount';
COMMENT ON FUNCTION calculate_anti_sniping_extension IS 'Calculate anti-sniping extension based on time remaining';
