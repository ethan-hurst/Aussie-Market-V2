-- Create listings table
CREATE TABLE IF NOT EXISTS public.listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    condition TEXT NOT NULL CHECK (condition IN ('new', 'like_new', 'good', 'fair', 'parts')),
    start_cents INTEGER NOT NULL CHECK (start_cents >= 100), -- Minimum $1.00
    reserve_cents INTEGER CHECK (reserve_cents >= 0),
    buy_now_cents INTEGER CHECK (buy_now_cents >= 0),
    current_bid_cents INTEGER DEFAULT 0,
    pickup BOOLEAN NOT NULL DEFAULT true,
    shipping BOOLEAN NOT NULL DEFAULT false,
    location JSONB NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'ended', 'sold', 'cancelled')),
    view_count INTEGER DEFAULT 0,
    bid_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_listings_seller_id ON public.listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_category_id ON public.listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_start_at ON public.listings(start_at);
CREATE INDEX IF NOT EXISTS idx_listings_end_at ON public.listings(end_at);
CREATE INDEX IF NOT EXISTS idx_listings_location_state ON public.listings USING GIN ((location->>'state'));
CREATE INDEX IF NOT EXISTS idx_listings_title_description ON public.listings USING GIN (to_tsvector('english', title || ' ' || description));

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_listings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_listings_updated_at
    BEFORE UPDATE ON public.listings
    FOR EACH ROW
    EXECUTE FUNCTION update_listings_updated_at();

-- Row Level Security (RLS) policies
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all active listings
CREATE POLICY "Users can view active listings" ON public.listings
    FOR SELECT
    USING (status = 'active');

-- Policy: Users can view their own listings regardless of status
CREATE POLICY "Users can view own listings" ON public.listings
    FOR SELECT
    USING (auth.uid() = seller_id);

-- Policy: KYC-verified sellers can create listings
CREATE POLICY "KYC-verified sellers can create listings" ON public.listings
    FOR INSERT
    WITH CHECK (
        auth.uid() = seller_id AND
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role = 'seller'
            AND kyc = 'passed'
        )
    );

-- Policy: Sellers can update their own draft/scheduled listings
CREATE POLICY "Sellers can update own draft listings" ON public.listings
    FOR UPDATE
    USING (
        auth.uid() = seller_id AND
        status IN ('draft', 'scheduled')
    );

-- Policy: Sellers can delete their own draft/scheduled listings
CREATE POLICY "Sellers can delete own draft listings" ON public.listings
    FOR DELETE
    USING (
        auth.uid() = seller_id AND
        status IN ('draft', 'scheduled')
    );

-- Functions for listing management
CREATE OR REPLACE FUNCTION get_listing_with_seller(listing_id UUID)
RETURNS TABLE (
    id UUID,
    seller_id UUID,
    title TEXT,
    description TEXT,
    category_id INTEGER,
    condition TEXT,
    start_cents INTEGER,
    reserve_cents INTEGER,
    buy_now_cents INTEGER,
    current_bid_cents INTEGER,
    pickup BOOLEAN,
    shipping BOOLEAN,
    location JSONB,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    status TEXT,
    view_count INTEGER,
    bid_count INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    seller_email TEXT,
    seller_legal_name TEXT,
    seller_kyc TEXT,
    seller_created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.*,
        u.email as seller_email,
        u.legal_name as seller_legal_name,
        u.kyc as seller_kyc,
        u.created_at as seller_created_at
    FROM public.listings l
    JOIN public.users u ON l.seller_id = u.id
    WHERE l.id = listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_listing_views(listing_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.listings
    SET view_count = view_count + 1
    WHERE id = listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's listings
CREATE OR REPLACE FUNCTION get_user_listings(user_id UUID, listing_status TEXT DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    category_id INTEGER,
    condition TEXT,
    start_cents INTEGER,
    reserve_cents INTEGER,
    buy_now_cents INTEGER,
    current_bid_cents INTEGER,
    pickup BOOLEAN,
    shipping BOOLEAN,
    location JSONB,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    status TEXT,
    view_count INTEGER,
    bid_count INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.title,
        l.description,
        l.category_id,
        l.condition,
        l.start_cents,
        l.reserve_cents,
        l.buy_now_cents,
        l.current_bid_cents,
        l.pickup,
        l.shipping,
        l.location,
        l.start_at,
        l.end_at,
        l.status,
        l.view_count,
        l.bid_count,
        l.created_at,
        l.updated_at
    FROM public.listings l
    WHERE l.seller_id = user_id
    AND (listing_status IS NULL OR l.status = listing_status)
    ORDER BY l.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to search listings
CREATE OR REPLACE FUNCTION search_listings(
    search_term TEXT DEFAULT NULL,
    category_filter INTEGER DEFAULT NULL,
    condition_filter TEXT DEFAULT NULL,
    state_filter TEXT DEFAULT NULL,
    min_price_cents INTEGER DEFAULT NULL,
    max_price_cents INTEGER DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    category_id INTEGER,
    condition TEXT,
    start_cents INTEGER,
    reserve_cents INTEGER,
    buy_now_cents INTEGER,
    current_bid_cents INTEGER,
    pickup BOOLEAN,
    shipping BOOLEAN,
    location JSONB,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    status TEXT,
    view_count INTEGER,
    bid_count INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    seller_legal_name TEXT,
    seller_kyc TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.*,
        u.legal_name as seller_legal_name,
        u.kyc as seller_kyc
    FROM public.listings l
    JOIN public.users u ON l.seller_id = u.id
    WHERE l.status = 'active'
    AND (search_term IS NULL OR 
         to_tsvector('english', l.title || ' ' || l.description) @@ plainto_tsquery('english', search_term))
    AND (category_filter IS NULL OR l.category_id = category_filter)
    AND (condition_filter IS NULL OR l.condition = condition_filter)
    AND (state_filter IS NULL OR l.location->>'state' = state_filter)
    AND (min_price_cents IS NULL OR l.start_cents >= min_price_cents)
    AND (max_price_cents IS NULL OR l.start_cents <= max_price_cents)
    ORDER BY l.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate listing data
CREATE OR REPLACE FUNCTION validate_listing_data(
    p_title TEXT,
    p_description TEXT,
    p_category_id INTEGER,
    p_condition TEXT,
    p_start_cents INTEGER,
    p_reserve_cents INTEGER,
    p_buy_now_cents INTEGER,
    p_start_at TIMESTAMPTZ,
    p_end_at TIMESTAMPTZ
)
RETURNS TABLE (
    valid BOOLEAN,
    error_message TEXT
) AS $$
BEGIN
    -- Check title length
    IF length(p_title) < 10 OR length(p_title) > 140 THEN
        RETURN QUERY SELECT FALSE, 'Title must be between 10 and 140 characters';
        RETURN;
    END IF;

    -- Check description length
    IF length(p_description) < 20 OR length(p_description) > 4096 THEN
        RETURN QUERY SELECT FALSE, 'Description must be between 20 and 4096 characters';
        RETURN;
    END IF;

    -- Check category
    IF p_category_id NOT IN (1, 2, 3, 4, 5, 6, 7) THEN
        RETURN QUERY SELECT FALSE, 'Invalid category';
        RETURN;
    END IF;

    -- Check condition
    IF p_condition NOT IN ('new', 'like_new', 'good', 'fair', 'parts') THEN
        RETURN QUERY SELECT FALSE, 'Invalid condition';
        RETURN;
    END IF;

    -- Check starting price
    IF p_start_cents < 100 THEN
        RETURN QUERY SELECT FALSE, 'Starting price must be at least $1.00';
        RETURN;
    END IF;

    -- Check reserve price
    IF p_reserve_cents IS NOT NULL AND p_reserve_cents <= p_start_cents THEN
        RETURN QUERY SELECT FALSE, 'Reserve price must be higher than starting price';
        RETURN;
    END IF;

    -- Check buy now price
    IF p_buy_now_cents IS NOT NULL AND p_buy_now_cents <= p_start_cents THEN
        RETURN QUERY SELECT FALSE, 'Buy now price must be higher than starting price';
        RETURN;
    END IF;

    -- Check dates
    IF p_start_at <= NOW() THEN
        RETURN QUERY SELECT FALSE, 'Start date must be in the future';
        RETURN;
    END IF;

    IF p_end_at <= p_start_at THEN
        RETURN QUERY SELECT FALSE, 'End date must be after start date';
        RETURN;
    END IF;

    -- All validations passed
    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get listing statistics
CREATE OR REPLACE FUNCTION get_listing_stats(listing_id UUID)
RETURNS TABLE (
    total_views INTEGER,
    total_bids INTEGER,
    highest_bid_cents INTEGER,
    time_remaining_seconds BIGINT,
    is_ended BOOLEAN
) AS $$
DECLARE
    listing_record RECORD;
BEGIN
    SELECT * INTO listing_record FROM public.listings WHERE id = listing_id;
    
    RETURN QUERY
    SELECT 
        listing_record.view_count,
        listing_record.bid_count,
        listing_record.current_bid_cents,
        EXTRACT(EPOCH FROM (listing_record.end_at - NOW())),
        NOW() > listing_record.end_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired listings
CREATE OR REPLACE FUNCTION cleanup_expired_listings()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE public.listings
    SET status = 'ended'
    WHERE status = 'active' AND end_at <= NOW();
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a scheduled job to cleanup expired listings (runs every hour)
-- Note: This requires pg_cron extension to be enabled
-- SELECT cron.schedule('cleanup-expired-listings', '0 * * * *', 'SELECT cleanup_expired_listings();');

-- Comments for documentation
COMMENT ON TABLE public.listings IS 'Auction listings created by verified sellers';
COMMENT ON COLUMN public.listings.start_cents IS 'Starting price in cents (minimum 100 cents = $1.00)';
COMMENT ON COLUMN public.listings.reserve_cents IS 'Reserve price in cents (optional minimum price)';
COMMENT ON COLUMN public.listings.buy_now_cents IS 'Buy now price in cents (optional instant purchase)';
COMMENT ON COLUMN public.listings.current_bid_cents IS 'Current highest bid in cents';
COMMENT ON COLUMN public.listings.location IS 'JSON object with street, suburb, postcode, state';
COMMENT ON COLUMN public.listings.status IS 'draft, scheduled, active, ended, sold, cancelled';
