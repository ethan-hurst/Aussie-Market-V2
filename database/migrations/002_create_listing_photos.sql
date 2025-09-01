-- Create listing_photos table with perceptual hash support
CREATE TABLE IF NOT EXISTS public.listing_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    path TEXT NOT NULL,
    order_idx INTEGER NOT NULL DEFAULT 0,
    perceptual_hash TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    mime_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_listing_photos_listing_id ON public.listing_photos(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_photos_order_idx ON public.listing_photos(order_idx);
CREATE INDEX IF NOT EXISTS idx_listing_photos_perceptual_hash ON public.listing_photos(perceptual_hash);
CREATE INDEX IF NOT EXISTS idx_listing_photos_created_at ON public.listing_photos(created_at);

-- Enable RLS
ALTER TABLE public.listing_photos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "users_can_view_listing_photos" ON public.listing_photos
    FOR SELECT USING (true); -- Public read access for listing photos

CREATE POLICY "sellers_can_manage_own_listing_photos" ON public.listing_photos
    FOR ALL USING (
        listing_id IN (
            SELECT id FROM public.listings 
            WHERE seller_id = auth.uid()
        )
    );

-- Add updated_at trigger
CREATE TRIGGER update_listing_photos_updated_at BEFORE UPDATE ON public.listing_photos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to check for duplicate images
CREATE OR REPLACE FUNCTION check_duplicate_image(
    p_hash TEXT,
    p_listing_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    -- If listing_id provided, exclude images from same listing
    IF p_listing_id IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1 FROM public.listing_photos 
            WHERE perceptual_hash = p_hash 
            AND listing_id != p_listing_id
        );
    ELSE
        RETURN EXISTS (
            SELECT 1 FROM public.listing_photos 
            WHERE perceptual_hash = p_hash
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get listing photos with proper ordering
CREATE OR REPLACE FUNCTION get_listing_photos(p_listing_id UUID)
RETURNS TABLE (
    id UUID,
    url TEXT,
    path TEXT,
    order_idx INTEGER,
    perceptual_hash TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    mime_type TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lp.id,
        lp.url,
        lp.path,
        lp.order_idx,
        lp.perceptual_hash,
        lp.file_size,
        lp.width,
        lp.height,
        lp.mime_type,
        lp.created_at
    FROM public.listing_photos lp
    WHERE lp.listing_id = p_listing_id
    ORDER BY lp.order_idx ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to reorder listing photos
CREATE OR REPLACE FUNCTION reorder_listing_photos(
    p_listing_id UUID,
    p_photo_orders JSONB
) RETURNS VOID AS $$
DECLARE
    photo_order RECORD;
BEGIN
    -- Update order_idx for each photo
    FOR photo_order IN 
        SELECT * FROM jsonb_array_elements(p_photo_orders) AS orders
    LOOP
        UPDATE public.listing_photos 
        SET order_idx = (photo_order.value->>'order_idx')::INTEGER
        WHERE id = (photo_order.value->>'id')::UUID 
        AND listing_id = p_listing_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clean up orphaned photos
CREATE OR REPLACE FUNCTION cleanup_orphaned_photos()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Delete photos that don't have a corresponding listing
    DELETE FROM public.listing_photos 
    WHERE listing_id NOT IN (SELECT id FROM public.listings);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add constraint to ensure order_idx is unique per listing
ALTER TABLE public.listing_photos 
ADD CONSTRAINT unique_listing_photo_order 
UNIQUE (listing_id, order_idx);

-- Add constraint to ensure perceptual_hash is unique (for duplicate detection)
CREATE UNIQUE INDEX IF NOT EXISTS unique_perceptual_hash 
ON public.listing_photos(perceptual_hash) 
WHERE perceptual_hash IS NOT NULL;
