# Supabase Storage Configuration

This document describes the storage setup for Aussie Market, including bucket configuration, policies, and usage patterns.

## Storage Buckets

### 1. listing-photos (Public Read, Authenticated Write)
- **Purpose**: Store listing images for auction items
- **Access**: Public read, authenticated users can upload if they own the listing
- **File Types**: JPEG, PNG, WebP
- **Max Size**: 10MB per file
- **Path Format**: `{listingId}/{orderIndex}_{uuid}.jpg`

### 2. evidence-uploads (Private)
- **Purpose**: Store evidence files for dispute resolution
- **Access**: Private, only involved parties can access
- **File Types**: JPEG, PNG, WebP, PDF
- **Max Size**: 10MB per file
- **Path Format**: `{disputeId}/{userId}_{uuid}_{filename}`

### 3. profile-avatars (Public Read, Owner Write)
- **Purpose**: Store user profile pictures
- **Access**: Public read, users can only upload their own avatar
- **File Types**: JPEG, PNG, WebP
- **Max Size**: 5MB per file
- **Path Format**: `{userId}/avatar_{uuid}.jpg`

## Setup Instructions

### 1. Create Storage Buckets

Run the following commands in your Supabase project:

```bash
# Create listing-photos bucket
supabase storage create-bucket listing-photos --public

# Create evidence-uploads bucket (private)
supabase storage create-bucket evidence-uploads

# Create profile-avatars bucket
supabase storage create-bucket profile-avatars --public
```

### 2. Configure Bucket Policies

#### listing-photos Policies

```sql
-- Public read access
CREATE POLICY "Public read access" ON storage.objects
FOR SELECT USING (bucket_id = 'listing-photos');

-- Authenticated users can upload if they own the listing
CREATE POLICY "Authenticated users can upload listing photos" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'listing-photos' 
    AND auth.role() = 'authenticated'
    AND check_listing_ownership(split_part(name, '/', 1)::UUID)
);

-- Users can update their own listing photos
CREATE POLICY "Users can update own listing photos" ON storage.objects
FOR UPDATE USING (
    bucket_id = 'listing-photos'
    AND auth.role() = 'authenticated'
    AND check_listing_ownership(split_part(name, '/', 1)::UUID)
);

-- Users can delete their own listing photos
CREATE POLICY "Users can delete own listing photos" ON storage.objects
FOR DELETE USING (
    bucket_id = 'listing-photos'
    AND auth.role() = 'authenticated'
    AND check_listing_ownership(split_part(name, '/', 1)::UUID)
);
```

#### evidence-uploads Policies

```sql
-- Only involved parties can access evidence files
CREATE POLICY "Involved parties can access evidence" ON storage.objects
FOR ALL USING (
    bucket_id = 'evidence-uploads'
    AND auth.role() = 'authenticated'
    AND check_dispute_involvement(split_part(name, '/', 1)::UUID)
);
```

#### profile-avatars Policies

```sql
-- Public read access
CREATE POLICY "Public read access" ON storage.objects
FOR SELECT USING (bucket_id = 'profile-avatars');

-- Users can manage their own avatars
CREATE POLICY "Users can manage own avatars" ON storage.objects
FOR ALL USING (
    bucket_id = 'profile-avatars'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = split_part(name, '/', 1)
);
```

## Usage Patterns

### Uploading Listing Photos

```typescript
import { uploadListingPhoto } from '$lib/storage';

const result = await uploadListingPhoto(file, listingId, orderIndex);
// Returns: { url, path, hash, metadata }
```

### Uploading Evidence Files

```typescript
import { uploadEvidenceFile } from '$lib/storage';

const result = await uploadEvidenceFile(file, disputeId, userId);
// Returns: { url, path, hash, metadata }
```

### Getting Signed URLs for Private Files

```typescript
import { getSignedUrl } from '$lib/storage';

const signedUrl = await getSignedUrl('evidence-uploads', filePath, 3600);
// Returns signed URL valid for 1 hour
```

### Deleting Files

```typescript
import { deleteFile } from '$lib/storage';

await deleteFile('listing-photos', filePath);
```

## Image Processing

### Automatic Processing

All uploaded images are automatically processed:

1. **EXIF Stripping**: Removes metadata for privacy
2. **Resizing**: Optimizes dimensions for web display
3. **Compression**: Reduces file size while maintaining quality
4. **Hash Generation**: Creates perceptual hash for duplicate detection

### Processing Options

```typescript
interface ImageProcessingOptions {
    quality?: number;        // 0.8 (default)
    maxWidth?: number;       // 1920 (default)
    maxHeight?: number;      // 1080 (default)
    stripExif?: boolean;     // true (default)
    generateHash?: boolean;  // true (default)
}
```

## Security Features

### File Validation

- **Type Checking**: Only allowed MIME types
- **Size Limits**: Configurable per bucket
- **Path Validation**: Enforces naming conventions
- **Duplicate Detection**: Prevents duplicate uploads

### Access Control

- **RLS Policies**: Row-level security on all buckets
- **Ownership Verification**: Users can only access their own files
- **Signed URLs**: Secure access to private files
- **Audit Trail**: Complete upload/delete logging

## Monitoring and Maintenance

### Storage Statistics

```typescript
import { getStorageStats } from '$lib/storage';

const stats = await getStorageStats();
// Returns usage statistics for all buckets
```

### Cleanup Functions

```sql
-- Clean up orphaned files
SELECT cleanup_orphaned_storage_files();

-- Get user storage usage
SELECT * FROM get_user_storage_usage(user_id);
```

### Automated Cleanup

Set up scheduled jobs for:

1. **Orphaned File Cleanup**: Remove files without database records
2. **Expired Signed URLs**: Clean up expired temporary URLs
3. **Storage Quota Monitoring**: Track user storage usage
4. **Duplicate Detection**: Identify and flag duplicate images

## Error Handling

### Common Issues

1. **File Too Large**: Check file size limits
2. **Invalid File Type**: Verify MIME type restrictions
3. **Permission Denied**: Check user ownership and policies
4. **Duplicate File**: Handle perceptual hash conflicts
5. **Storage Quota**: Monitor user storage limits

### Error Recovery

- **Retry Logic**: Automatic retry for transient failures
- **Fallback Processing**: Alternative processing paths
- **User Feedback**: Clear error messages and guidance
- **Logging**: Comprehensive error logging for debugging

## Performance Optimization

### Caching Strategy

- **CDN Integration**: Use Supabase CDN for public files
- **Cache Headers**: Set appropriate cache control headers
- **Image Optimization**: Automatic format conversion and compression
- **Lazy Loading**: Implement progressive image loading

### Storage Optimization

- **File Deduplication**: Prevent duplicate storage
- **Compression**: Optimize file sizes
- **Format Selection**: Choose optimal formats per use case
- **Cleanup Scheduling**: Regular maintenance and cleanup

## Compliance and Privacy

### Data Protection

- **EXIF Removal**: Strip location and device metadata
- **Access Logging**: Track all file access
- **Retention Policies**: Define file retention periods
- **GDPR Compliance**: Support data deletion requests

### Security Measures

- **Encryption**: All files encrypted at rest
- **Access Controls**: Strict permission policies
- **Audit Logging**: Complete access audit trail
- **Virus Scanning**: Implement malware detection

## Troubleshooting

### Common Problems

1. **Upload Failures**: Check file size and type restrictions
2. **Permission Errors**: Verify RLS policies and user permissions
3. **Performance Issues**: Monitor storage usage and optimize
4. **Duplicate Files**: Review perceptual hash implementation

### Debug Tools

- **Storage Dashboard**: Use Supabase dashboard for monitoring
- **Policy Testing**: Test policies with sample data
- **Log Analysis**: Review access and error logs
- **Performance Metrics**: Monitor upload/download speeds
