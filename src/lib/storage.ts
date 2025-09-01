import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { ExifReader } from 'exifr';
import { bmvbhash } from 'blockhash-core';

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
	try {
		// Convert file to buffer
		const buffer = await file.arrayBuffer();
		
		// Use Sharp to process the image and get a consistent format
		const processedBuffer = await sharp(buffer)
			.resize(256, 256, { fit: 'cover' })
			.greyscale()
			.raw()
			.toBuffer();
		
		// Convert buffer to ImageData-like structure for blockhash
		const imageData = {
			data: new Uint8ClampedArray(processedBuffer),
			width: 256,
			height: 256
		};
		
		// Generate perceptual hash using blockhash
		const hash = bmvbhash(imageData, 16); // 16-bit hash
		
		return hash;
	} catch (error) {
		console.error('Error generating image hash:', error);
		// Fallback to simple hash if perceptual hashing fails
		const arrayBuffer = await file.arrayBuffer();
		const uint8Array = new Uint8Array(arrayBuffer);
		
		let hash = 0;
		for (let i = 0; i < uint8Array.length; i++) {
			hash = ((hash << 5) - hash + uint8Array[i]) & 0xffffffff;
		}
		
		return hash.toString(16);
	}
}

/**
 * Strip EXIF data from image
 */
export async function stripExifData(file: File): Promise<Blob> {
	try {
		// Convert file to buffer
		const buffer = await file.arrayBuffer();
		
		// Use Sharp to process the image and strip EXIF data
		const processedBuffer = await sharp(buffer)
			.rotate() // Auto-rotate based on EXIF orientation, then strip EXIF
			.jpeg({ 
				quality: 95, // High quality to preserve image
				mozjpeg: true // Use mozjpeg for better compression
			})
			.toBuffer();
		
		// Return as Blob with correct MIME type
		return new Blob([processedBuffer], { type: 'image/jpeg' });
	} catch (error) {
		console.error('Error stripping EXIF data:', error);
		// Fallback to original file if EXIF stripping fails
		return file;
	}
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
	try {
		// Convert file to buffer
		const buffer = await file.arrayBuffer();
		
		// Use Sharp to resize and optimize the image
		const processedBuffer = await sharp(buffer)
			.resize(maxWidth, maxHeight, {
				fit: 'inside', // Maintain aspect ratio
				withoutEnlargement: true // Don't upscale small images
			})
			.jpeg({ 
				quality: Math.round(quality * 100), // Convert 0-1 to 0-100
				progressive: true, // Progressive JPEG for better loading
				mozjpeg: true // Use mozjpeg for better compression
			})
			.toBuffer();
		
		// Return as Blob with correct MIME type
		return new Blob([processedBuffer], { type: 'image/jpeg' });
	} catch (error) {
		console.error('Error resizing image:', error);
		// Fallback to canvas-based resizing if Sharp fails
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
 * Calculate Hamming distance between two hashes for duplicate detection
 */
export function calculateHammingDistance(hash1: string, hash2: string): number {
	if (hash1.length !== hash2.length) {
		return Infinity; // Different length hashes can't be compared
	}
	
	let distance = 0;
	for (let i = 0; i < hash1.length; i++) {
		if (hash1[i] !== hash2[i]) {
			distance++;
		}
	}
	
	return distance;
}

/**
 * Check if two images are likely duplicates based on perceptual hashing
 */
export function areSimilarImages(hash1: string, hash2: string, threshold: number = 5): boolean {
	const distance = calculateHammingDistance(hash1, hash2);
	return distance <= threshold;
}

/**
 * Find similar images in a collection of hashes
 */
export function findSimilarImages(
	newHash: string, 
	existingHashes: string[], 
	threshold: number = 5
): string[] {
	return existingHashes.filter(hash => areSimilarImages(newHash, hash, threshold));
}

/**
 * Check for duplicate images in the database using perceptual hashing
 */
export async function checkImageDuplicate(
	hash: string, 
	listingId?: string, 
	threshold: number = 5
): Promise<{
	isDuplicate: boolean;
	similarCount: number;
	similarImages: Array<{
		listing_id: string;
		photo_url: string;
		hamming_distance: number;
	}>;
}> {
	try {
		const { data, error } = await supabase.rpc('check_image_duplicate', {
			p_hash: hash,
			p_listing_id: listingId || null,
			p_threshold: threshold
		});

		if (error) {
			console.error('Error checking image duplicate:', error);
			return { isDuplicate: false, similarCount: 0, similarImages: [] };
		}

		return {
			isDuplicate: data.is_duplicate,
			similarCount: data.similar_count,
			similarImages: data.similar_images || []
		};
	} catch (error) {
		console.error('Error checking image duplicate:', error);
		return { isDuplicate: false, similarCount: 0, similarImages: [] };
	}
}

/**
 * Enhanced image validation with format and dimension checks
 */
export async function validateImageFile(file: File): Promise<{ 
	valid: boolean; 
	error?: string; 
	metadata?: { width: number; height: number; format: string; } 
}> {
	// Basic validation first
	const basicValidation = validateFile(file);
	if (!basicValidation.valid) {
		return basicValidation;
	}
	
	try {
		// Use Sharp to get image metadata and validate
		const buffer = await file.arrayBuffer();
		const metadata = await sharp(buffer).metadata();
		
		if (!metadata.width || !metadata.height) {
			return {
				valid: false,
				error: 'Invalid image file - unable to read dimensions.'
			};
		}
		
		// Check minimum dimensions (avoid tiny images)
		if (metadata.width < 100 || metadata.height < 100) {
			return {
				valid: false,
				error: 'Image too small. Minimum size is 100x100 pixels.'
			};
		}
		
		// Check maximum dimensions (avoid huge images)
		if (metadata.width > 5000 || metadata.height > 5000) {
			return {
				valid: false,
				error: 'Image too large. Maximum size is 5000x5000 pixels.'
			};
		}
		
		return { 
			valid: true, 
			metadata: {
				width: metadata.width,
				height: metadata.height,
				format: metadata.format || 'unknown'
			}
		};
	} catch (error) {
		console.error('Error validating image:', error);
		return {
			valid: false,
			error: 'Invalid or corrupted image file.'
		};
	}
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
		// Enhanced image validation
		const validation = await validateImageFile(file);
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
