-- Add image duplicate detection functionality

-- Create function to find similar images by perceptual hash
CREATE OR REPLACE FUNCTION find_similar_images(
    p_hash TEXT,
    p_threshold INTEGER DEFAULT 5,
    p_exclude_listing_id UUID DEFAULT NULL
)
RETURNS TABLE (
    listing_id UUID,
    photo_id UUID,
    photo_url TEXT,
    photo_hash TEXT,
    hamming_distance INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id as listing_id,
        lp.id as photo_id,
        lp.url as photo_url,
        lp.phash as photo_hash,
        -- Calculate Hamming distance using PostgreSQL bit operations
        bit_count(
            (('x' || lpad(p_hash, 16, '0'))::bit(64))::bigint #
            (('x' || lpad(lp.phash, 16, '0'))::bit(64))::bigint
        ) as hamming_distance
    FROM listing_photos lp
    INNER JOIN listings l ON lp.listing_id = l.id
    WHERE 
        lp.phash IS NOT NULL
        AND lp.phash != p_hash
        AND (p_exclude_listing_id IS NULL OR l.id != p_exclude_listing_id)
        AND bit_count(
            (('x' || lpad(p_hash, 16, '0'))::bit(64))::bigint #
            (('x' || lpad(lp.phash, 16, '0'))::bit(64))::bigint
        ) <= p_threshold
    ORDER BY hamming_distance ASC
    LIMIT 20;
END;
$$;

-- Create function to check if an image is a potential duplicate before upload
CREATE OR REPLACE FUNCTION check_image_duplicate(
    p_hash TEXT,
    p_listing_id UUID DEFAULT NULL,
    p_threshold INTEGER DEFAULT 5
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_similar_count INTEGER;
    v_similar_images JSON;
BEGIN
    -- Count similar images
    SELECT COUNT(*) INTO v_similar_count
    FROM find_similar_images(p_hash, p_threshold, p_listing_id);
    
    -- Get similar images details if any found
    IF v_similar_count > 0 THEN
        SELECT json_agg(
            json_build_object(
                'listing_id', listing_id,
                'photo_url', photo_url,
                'hamming_distance', hamming_distance
            )
        ) INTO v_similar_images
        FROM find_similar_images(p_hash, p_threshold, p_listing_id);
    END IF;
    
    RETURN json_build_object(
        'is_duplicate', v_similar_count > 0,
        'similar_count', v_similar_count,
        'similar_images', COALESCE(v_similar_images, '[]'::json),
        'threshold_used', p_threshold
    );
END;
$$;

-- Add index on phash for better performance
CREATE INDEX IF NOT EXISTS idx_listing_photos_phash 
ON listing_photos(phash) 
WHERE phash IS NOT NULL;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION find_similar_images TO authenticated;
GRANT EXECUTE ON FUNCTION find_similar_images TO service_role;
GRANT EXECUTE ON FUNCTION check_image_duplicate TO authenticated;
GRANT EXECUTE ON FUNCTION check_image_duplicate TO service_role;

-- Add comment explaining the bit operations
COMMENT ON FUNCTION find_similar_images IS 
'Find images with similar perceptual hashes using Hamming distance. 
Uses PostgreSQL bit operations to calculate XOR and count differing bits.
Lower hamming_distance means more similar images.';

COMMENT ON FUNCTION check_image_duplicate IS 
'Check if an uploaded image hash matches existing images within threshold.
Returns JSON with duplicate status and details of similar images found.';
