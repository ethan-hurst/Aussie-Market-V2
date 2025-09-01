-- Fix storage functions by removing Supabase-specific dependencies
-- This migration provides utility functions for storage management without requiring the storage extension

-- Create function to check if user owns a listing
CREATE OR REPLACE FUNCTION check_listing_ownership(listing_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.listings 
        WHERE id = listing_id 
        AND seller_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user is involved in a dispute
CREATE OR REPLACE FUNCTION check_dispute_involvement(dispute_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.disputes 
        WHERE id = dispute_id 
        AND (buyer_id = auth.uid() OR seller_id = auth.uid())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to validate file upload parameters
CREATE OR REPLACE FUNCTION validate_file_upload_params(
    bucket_id TEXT,
    file_name TEXT,
    file_size BIGINT,
    mime_type TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check file size limit (50MB)
    IF file_size > 50 * 1024 * 1024 THEN
        RETURN FALSE;
    END IF;
    
    -- Check allowed MIME types
    IF mime_type NOT IN ('image/jpeg', 'image/jpg', 'image/png', 'image/webp') THEN
        RETURN FALSE;
    END IF;
    
    -- Check bucket-specific rules
    CASE bucket_id
        WHEN 'listing-photos' THEN
            -- Validate listing-photos path format: listingId/orderIndex_uuid.jpg
            IF file_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/\d+_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$' THEN
                RETURN FALSE;
            END IF;
        WHEN 'evidence-uploads' THEN
            -- Validate evidence-uploads path format: disputeId/userId_uuid_filename
            IF file_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_' THEN
                RETURN FALSE;
            END IF;
        WHEN 'profile-avatars' THEN
            -- Validate profile-avatars path format: userId/avatar_uuid.jpg
            IF file_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$' THEN
                RETURN FALSE;
            END IF;
        ELSE
            RETURN FALSE;
    END CASE;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get listing photos for a listing
CREATE OR REPLACE FUNCTION get_listing_photos_info(listing_id UUID)
RETURNS TABLE (
    id UUID,
    url TEXT,
    path TEXT,
    order_idx INTEGER,
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
        lp.file_size,
        lp.width,
        lp.height,
        lp.mime_type,
        lp.created_at
    FROM public.listing_photos lp
    WHERE lp.listing_id = get_listing_photos_info.listing_id
    ORDER BY lp.order_idx ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check for duplicate images by hash
CREATE OR REPLACE FUNCTION check_duplicate_image_hash(
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

-- Create function to get storage statistics for a user
CREATE OR REPLACE FUNCTION get_user_storage_stats(user_id UUID)
RETURNS TABLE (
    listing_photos_count BIGINT,
    listing_photos_size BIGINT,
    profile_avatar_count BIGINT,
    profile_avatar_size BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(lp_stats.count, 0) as listing_photos_count,
        COALESCE(lp_stats.total_size, 0) as listing_photos_size,
        COALESCE(pa_stats.count, 0) as profile_avatar_count,
        COALESCE(pa_stats.total_size, 0) as profile_avatar_size
    FROM (
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(file_size), 0) as total_size
        FROM public.listing_photos lp
        JOIN public.listings l ON lp.listing_id = l.id
        WHERE l.seller_id = get_user_storage_stats.user_id
    ) lp_stats
    CROSS JOIN (
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(file_size), 0) as total_size
        FROM public.listing_photos lp
        WHERE lp.path LIKE get_user_storage_stats.user_id::text || '/avatar_%'
    ) pa_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to cleanup orphaned listing photos
CREATE OR REPLACE FUNCTION cleanup_orphaned_listing_photos()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Delete listing photos that don't have a corresponding listing
    DELETE FROM public.listing_photos 
    WHERE listing_id NOT IN (SELECT id FROM public.listings);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to validate image dimensions
CREATE OR REPLACE FUNCTION validate_image_dimensions(
    width INTEGER,
    height INTEGER,
    max_width INTEGER DEFAULT 4096,
    max_height INTEGER DEFAULT 4096,
    min_width INTEGER DEFAULT 100,
    min_height INTEGER DEFAULT 100
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check minimum dimensions
    IF width < min_width OR height < min_height THEN
        RETURN FALSE;
    END IF;
    
    -- Check maximum dimensions
    IF width > max_width OR height > max_height THEN
        RETURN FALSE;
    END IF;
    
    -- Check aspect ratio (prevent extremely wide/tall images)
    IF width::DECIMAL / height > 10 OR height::DECIMAL / width > 10 THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get file extension from MIME type
CREATE OR REPLACE FUNCTION get_file_extension(mime_type TEXT)
RETURNS TEXT AS $$
BEGIN
    CASE mime_type
        WHEN 'image/jpeg' THEN RETURN 'jpg';
        WHEN 'image/jpg' THEN RETURN 'jpg';
        WHEN 'image/png' THEN RETURN 'png';
        WHEN 'image/webp' THEN RETURN 'webp';
        ELSE RETURN 'bin';
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to generate secure file path
CREATE OR REPLACE FUNCTION generate_secure_file_path(
    bucket_id TEXT,
    user_id UUID,
    listing_id UUID DEFAULT NULL,
    file_extension TEXT DEFAULT 'jpg'
)
RETURNS TEXT AS $$
DECLARE
    file_uuid UUID;
    file_path TEXT;
BEGIN
    file_uuid := gen_random_uuid();
    
    CASE bucket_id
        WHEN 'listing-photos' THEN
            IF listing_id IS NULL THEN
                RAISE EXCEPTION 'listing_id is required for listing-photos bucket';
            END IF;
            file_path := listing_id::text || '/' || file_uuid::text || '.' || file_extension;
        WHEN 'profile-avatars' THEN
            file_path := user_id::text || '/avatar_' || file_uuid::text || '.' || file_extension;
        WHEN 'evidence-uploads' THEN
            file_path := user_id::text || '/evidence_' || file_uuid::text || '.' || file_extension;
        ELSE
            RAISE EXCEPTION 'Invalid bucket_id: %', bucket_id;
    END CASE;
    
    RETURN file_path;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON FUNCTION check_listing_ownership IS 'Check if the authenticated user owns a specific listing';
COMMENT ON FUNCTION check_dispute_involvement IS 'Check if the authenticated user is involved in a specific dispute';
COMMENT ON FUNCTION validate_file_upload_params IS 'Validate file upload parameters including size, type, and path format';
COMMENT ON FUNCTION get_listing_photos_info IS 'Get all photos for a specific listing with metadata';
COMMENT ON FUNCTION check_duplicate_image_hash IS 'Check if an image hash already exists in the system';
COMMENT ON FUNCTION get_user_storage_stats IS 'Get storage usage statistics for a specific user';
COMMENT ON FUNCTION cleanup_orphaned_listing_photos IS 'Remove listing photos that no longer have a corresponding listing';
COMMENT ON FUNCTION validate_image_dimensions IS 'Validate image dimensions against minimum and maximum constraints';
COMMENT ON FUNCTION get_file_extension IS 'Get file extension from MIME type';
COMMENT ON FUNCTION generate_secure_file_path IS 'Generate a secure file path for uploads';
