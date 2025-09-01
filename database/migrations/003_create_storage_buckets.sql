-- Create storage buckets for different file types
-- Note: Storage buckets are created via Supabase dashboard or CLI
-- This migration sets up the policies and configurations

-- Note: Storage extension is Supabase-specific and not available in standard PostgreSQL
-- This migration provides utility functions that work with standard PostgreSQL
-- The actual storage buckets are created via Supabase dashboard or CLI

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

-- Note: Storage.objects table is part of the Supabase storage extension
-- This function is not available in standard PostgreSQL
-- Use get_listing_photos_info() instead for listing photos

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

-- Note: Storage.objects table is part of the Supabase storage extension
-- Use cleanup_orphaned_listing_photos() instead for cleaning up listing photos

-- Note: Storage.objects table is part of the Supabase storage extension
-- Use get_user_storage_stats() instead for user storage statistics

-- Note: This function has been moved to migration 007_fix_storage_functions.sql
-- Use validate_file_upload_params() instead
