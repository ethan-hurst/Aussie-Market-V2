import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';

// Storage bucket names
export const STORAGE_BUCKETS = {
	LISTING_PHOTOS: 'listing-photos',
	EVIDENCE_UPLOADS: 'evidence-uploads',
	PROFILE_AVATARS: 'profile-avatars'
} as const;

// File type validation
export const ALLOWED_IMAGE_TYPES = [
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/webp'
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_IMAGES_PER_LISTING = 10;

// Image processing options
export interface ImageProcessingOptions {
	quality?: number;
	maxWidth?: number;
	maxHeight?: number;
	stripExif?: boolean;
	generateHash?: boolean;
}

export interface UploadResult {
	url: string;
	path: string;
	hash?: string;
	metadata: {
		size: number;
		width?: number;
		height?: number;
		type: string;
		uploadedAt: string;
	};
}

/**
 * Generate a perceptual hash for duplicate detection
 */
export async function generateImageHash(file: File): Promise<string> {
	// For now, we'll use a simple hash based on file size and name
	// In production, you'd want to use a proper perceptual hashing library
	const arrayBuffer = await file.arrayBuffer();
	const uint8Array = new Uint8Array(arrayBuffer);
	
	// Simple hash function
	let hash = 0;
	for (let i = 0; i < uint8Array.length; i++) {
		hash = ((hash << 5) - hash + uint8Array[i]) & 0xffffffff;
	}
	
	return hash.toString(16);
}

/**
 * Strip EXIF data from image
 */
export async function stripExifData(file: File): Promise<Blob> {
	// For now, we'll return the original file
	// In production, you'd want to use a library like exifr to strip EXIF
	return file;
}

/**
 * Resize image to specified dimensions
 */
export async function resizeImage(
	file: File,
	maxWidth: number = 1920,
	maxHeight: number = 1080,
	quality: number = 0.8
): Promise<Blob> {
	return new Promise((resolve) => {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d')!;
		const img = new Image();
		
		img.onload = () => {
			// Calculate new dimensions
			let { width, height } = img;
			
			if (width > maxWidth) {
				height = (height * maxWidth) / width;
				width = maxWidth;
			}
			
			if (height > maxHeight) {
				width = (width * maxHeight) / height;
				height = maxHeight;
			}
			
			// Set canvas dimensions
			canvas.width = width;
			canvas.height = height;
			
			// Draw and compress image
			ctx.drawImage(img, 0, 0, width, height);
			canvas.toBlob(resolve, 'image/jpeg', quality);
		};
		
		img.src = URL.createObjectURL(file);
	});
}

/**
 * Validate file before upload
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
	// Check file type
	if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
		return {
			valid: false,
			error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.'
		};
	}
	
	// Check file size
	if (file.size > MAX_FILE_SIZE) {
		return {
			valid: false,
			error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`
		};
	}
	
	return { valid: true };
}

/**
 * Upload image to Supabase Storage
 */
export async function uploadImage(
	file: File,
	bucket: string,
	path: string,
	options: ImageProcessingOptions = {}
): Promise<UploadResult> {
	try {
		// Validate file
		const validation = validateFile(file);
		if (!validation.valid) {
			throw new Error(validation.error);
		}
		
		// Process image
		let processedFile = file;
		
		// Strip EXIF if requested
		if (options.stripExif !== false) {
			processedFile = await stripExifData(file);
		}
		
		// Resize if dimensions specified
		if (options.maxWidth || options.maxHeight) {
			processedFile = await resizeImage(
				processedFile as File,
				options.maxWidth,
				options.maxHeight,
				options.quality
			);
		}
		
		// Generate hash if requested
		let hash: string | undefined;
		if (options.generateHash !== false) {
			hash = await generateImageHash(file);
		}
		
		// Upload to Supabase Storage
		const { data, error } = await supabase.storage
			.from(bucket)
			.upload(path, processedFile, {
				cacheControl: '3600',
				upsert: false
			});
		
		if (error) {
			throw new Error(`Upload failed: ${error.message}`);
		}
		
		// Get public URL
		const { data: urlData } = supabase.storage
			.from(bucket)
			.getPublicUrl(path);
		
		// Get file metadata
		const metadata = {
			size: file.size,
			type: file.type,
			uploadedAt: new Date().toISOString()
		};
		
		return {
			url: urlData.publicUrl,
			path: data.path,
			hash,
			metadata
		};
		
	} catch (error) {
		console.error('Image upload error:', error);
		throw error;
	}
}

/**
 * Upload listing photo
 */
export async function uploadListingPhoto(
	file: File,
	listingId: string,
	orderIndex: number
): Promise<UploadResult> {
	const fileName = `${listingId}/${orderIndex}_${uuidv4()}.jpg`;
	
	return uploadImage(file, STORAGE_BUCKETS.LISTING_PHOTOS, fileName, {
		maxWidth: 1920,
		maxHeight: 1080,
		quality: 0.8,
		stripExif: true,
		generateHash: true
	});
}

/**
 * Upload evidence file (private)
 */
export async function uploadEvidenceFile(
	file: File,
	disputeId: string,
	userId: string
): Promise<UploadResult> {
	const fileName = `${disputeId}/${userId}_${uuidv4()}_${file.name}`;
	
	return uploadImage(file, STORAGE_BUCKETS.EVIDENCE_UPLOADS, fileName, {
		maxWidth: 1920,
		maxHeight: 1080,
		quality: 0.8,
		stripExif: true,
		generateHash: true
	});
}

/**
 * Upload profile avatar
 */
export async function uploadProfileAvatar(
	file: File,
	userId: string
): Promise<UploadResult> {
	const fileName = `${userId}/avatar_${uuidv4()}.jpg`;
	
	return uploadImage(file, STORAGE_BUCKETS.PROFILE_AVATARS, fileName, {
		maxWidth: 400,
		maxHeight: 400,
		quality: 0.8,
		stripExif: true,
		generateHash: false
	});
}

/**
 * Delete file from storage
 */
export async function deleteFile(bucket: string, path: string): Promise<void> {
	try {
		const { error } = await supabase.storage
			.from(bucket)
			.remove([path]);
		
		if (error) {
			throw new Error(`Delete failed: ${error.message}`);
		}
	} catch (error) {
		console.error('File deletion error:', error);
		throw error;
	}
}

/**
 * Get signed URL for private files
 */
export async function getSignedUrl(
	bucket: string,
	path: string,
	expiresIn: number = 3600
): Promise<string> {
	try {
		const { data, error } = await supabase.storage
			.from(bucket)
			.createSignedUrl(path, expiresIn);
		
		if (error) {
			throw new Error(`Signed URL generation failed: ${error.message}`);
		}
		
		return data.signedUrl;
	} catch (error) {
		console.error('Signed URL generation error:', error);
		throw error;
	}
}

/**
 * Check for duplicate images using perceptual hash
 */
export async function checkDuplicateImage(hash: string, listingId?: string): Promise<boolean> {
	try {
		// Query database for existing images with same hash
		const { data, error } = await supabase
			.from('listing_photos')
			.select('id, listing_id')
			.eq('perceptual_hash', hash);
		
		if (error) {
			console.error('Duplicate check error:', error);
			return false;
		}
		
		// If listingId provided, exclude images from same listing
		if (listingId) {
			return data.some(photo => photo.listing_id !== listingId);
		}
		
		return data.length > 0;
	} catch (error) {
		console.error('Duplicate check error:', error);
		return false;
	}
}

/**
 * Get storage usage statistics
 */
export async function getStorageStats(): Promise<{
	totalSize: number;
	fileCount: number;
	buckets: Record<string, { size: number; count: number }>;
}> {
	try {
		const stats = {
			totalSize: 0,
			fileCount: 0,
			buckets: {} as Record<string, { size: number; count: number }>
		};
		
		// Get stats for each bucket
		for (const bucket of Object.values(STORAGE_BUCKETS)) {
			const { data, error } = await supabase.storage
				.from(bucket)
				.list('', { limit: 1000 });
			
			if (error) {
				console.error(`Error getting stats for bucket ${bucket}:`, error);
				continue;
			}
			
			const bucketStats = {
				size: 0,
				count: data.length
			};
			
			// Calculate total size (this is a simplified version)
			// In production, you'd want to track file sizes in the database
			bucketStats.size = data.length * 1024 * 1024; // Estimate 1MB per file
			
			stats.buckets[bucket] = bucketStats;
			stats.totalSize += bucketStats.size;
			stats.fileCount += bucketStats.count;
		}
		
		return stats;
	} catch (error) {
		console.error('Storage stats error:', error);
		throw error;
	}
}
