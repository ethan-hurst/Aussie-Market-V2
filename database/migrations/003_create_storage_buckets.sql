-- Create storage buckets for different file types
-- Note: Storage buckets are created via Supabase dashboard or CLI
-- This migration sets up the policies and configurations

-- Enable storage extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "storage";

-- Storage bucket policies for listing-photos (public read, authenticated write)
-- Bucket: listing-photos
-- Public read access for viewing listing photos
-- Authenticated users can upload if they own the listing

-- Storage bucket policies for evidence-uploads (private)
-- Bucket: evidence-uploads  
-- Only involved parties can access evidence files
-- Requires signed URLs for access

-- Storage bucket policies for profile-avatars (public read, owner write)
-- Bucket: profile-avatars
-- Public read access for profile pictures
-- Users can only upload their own avatar

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

-- Create function to get user's own files
CREATE OR REPLACE FUNCTION get_user_files(user_id UUID)
RETURNS TABLE (path TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT storage.objects.name
    FROM storage.objects
    WHERE storage.objects.name LIKE user_id::text || '/%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: The actual bucket policies are configured via Supabase dashboard
-- or using the storage API. The policies below are examples of what
-- should be configured:

/*
-- Example bucket policies (configure via Supabase dashboard):

-- listing-photos bucket policies:
-- SELECT: true (public read)
-- INSERT: auth.role() = 'authenticated' AND check_listing_ownership(listing_id)
-- UPDATE: auth.role() = 'authenticated' AND check_listing_ownership(listing_id)  
-- DELETE: auth.role() = 'authenticated' AND check_listing_ownership(listing_id)

-- evidence-uploads bucket policies:
-- SELECT: auth.role() = 'authenticated' AND check_dispute_involvement(dispute_id)
-- INSERT: auth.role() = 'authenticated' AND check_dispute_involvement(dispute_id)
-- UPDATE: auth.role() = 'authenticated' AND check_dispute_involvement(dispute_id)
-- DELETE: auth.role() = 'authenticated' AND check_dispute_involvement(dispute_id)

-- profile-avatars bucket policies:
-- SELECT: true (public read)
-- INSERT: auth.uid()::text = split_part(name, '/', 1)
-- UPDATE: auth.uid()::text = split_part(name, '/', 1)
-- DELETE: auth.uid()::text = split_part(name, '/', 1)
*/

-- Create storage cleanup function
CREATE OR REPLACE FUNCTION cleanup_orphaned_storage_files()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    orphaned_file RECORD;
BEGIN
    -- Clean up orphaned listing photos
    FOR orphaned_file IN 
        SELECT o.name, o.id
        FROM storage.objects o
        WHERE o.bucket_id = 'listing-photos'
        AND NOT EXISTS (
            SELECT 1 FROM public.listing_photos lp
            WHERE lp.path = o.name
        )
    LOOP
        DELETE FROM storage.objects WHERE id = orphaned_file.id;
        deleted_count := deleted_count + 1;
    END LOOP;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get storage usage by user
CREATE OR REPLACE FUNCTION get_user_storage_usage(user_id UUID)
RETURNS TABLE (
    bucket_id TEXT,
    file_count BIGINT,
    total_size BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.bucket_id,
        COUNT(*) as file_count,
        COALESCE(SUM(o.metadata->>'size')::BIGINT, 0) as total_size
    FROM storage.objects o
    WHERE o.name LIKE user_id::text || '/%'
    GROUP BY o.bucket_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to validate file upload
CREATE OR REPLACE FUNCTION validate_file_upload(
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
