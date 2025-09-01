import { supabase } from './supabase';
import { z } from 'zod';

// Listing validation schemas
export const ListingSchema = z.object({
	title: z.string().min(10).max(140),
	description: z.string().min(20).max(4096),
	category_id: z.number().int().positive(),
	condition: z.enum(['new', 'like_new', 'good', 'fair', 'parts']),
	start_cents: z.number().int().min(100), // Minimum $1.00
	reserve_cents: z.number().int().min(0).optional(),
	buy_now_cents: z.number().int().min(0).optional(),
	pickup: z.boolean(),
	shipping: z.boolean(),
	location: z.object({
		street: z.string().min(1),
		suburb: z.string().min(1),
		postcode: z.string().regex(/^\d{4}$/),
		state: z.enum(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'])
	}),
	start_at: z.string().datetime(),
	end_at: z.string().datetime()
});

export const ListingUpdateSchema = ListingSchema.partial();

export type ListingData = z.infer<typeof ListingSchema>;
export type ListingUpdateData = z.infer<typeof ListingUpdateSchema>;

// Category definitions
export const CATEGORIES = [
	{ id: 1, name: 'Electronics', slug: 'electronics' },
	{ id: 2, name: 'Home & Garden', slug: 'home-garden' },
	{ id: 3, name: 'Fashion', slug: 'fashion' },
	{ id: 4, name: 'Sports & Leisure', slug: 'sports-leisure' },
	{ id: 5, name: 'Collectibles', slug: 'collectibles' },
	{ id: 6, name: 'Vehicles', slug: 'vehicles' },
	{ id: 7, name: 'Books & Media', slug: 'books-media' }
] as const;

export const CONDITIONS = [
	{ id: 'new', name: 'New', description: 'Brand new, never used' },
	{ id: 'like_new', name: 'Like New', description: 'Used but in excellent condition' },
	{ id: 'good', name: 'Good', description: 'Used with normal wear and tear' },
	{ id: 'fair', name: 'Fair', description: 'Used with noticeable wear' },
	{ id: 'parts', name: 'For Parts', description: 'Not working, for parts only' }
] as const;

export const AUSTRALIAN_STATES = [
	{ code: 'NSW', name: 'New South Wales' },
	{ code: 'VIC', name: 'Victoria' },
	{ code: 'QLD', name: 'Queensland' },
	{ code: 'WA', name: 'Western Australia' },
	{ code: 'SA', name: 'South Australia' },
	{ code: 'TAS', name: 'Tasmania' },
	{ code: 'ACT', name: 'Australian Capital Territory' },
	{ code: 'NT', name: 'Northern Territory' }
] as const;

/**
 * Check if user can create listings (KYC verified seller)
 */
export async function canCreateListing(userId: string): Promise<{
	allowed: boolean;
	reason?: string;
	userProfile?: any;
}> {
	try {
		const { data: userProfile, error } = await supabase
			.from('users')
			.select('role, kyc')
			.eq('id', userId)
			.single();

		if (error) {
			return { allowed: false, reason: 'User profile not found' };
		}

		if (userProfile.role !== 'seller') {
			return { 
				allowed: false, 
				reason: 'Seller account required',
				userProfile 
			};
		}

		if (userProfile.kyc !== 'passed') {
			return { 
				allowed: false, 
				reason: 'KYC verification required',
				userProfile 
			};
		}

		return { allowed: true, userProfile };
	} catch (error) {
		console.error('Error checking listing permissions:', error);
		return { allowed: false, reason: 'Permission check failed' };
	}
}

/**
 * Check if user can edit a listing
 */
export async function canEditListing(userId: string, listingId: string): Promise<{
	allowed: boolean;
	reason?: string;
	listing?: any;
}> {
	try {
		const { data: listing, error } = await supabase
			.from('listings')
			.select('*')
			.eq('id', listingId)
			.eq('seller_id', userId)
			.single();

		if (error || !listing) {
			return { allowed: false, reason: 'Listing not found or access denied' };
		}

		// Check if listing is in editable state
		if (listing.status !== 'draft' && listing.status !== 'scheduled') {
			return { 
				allowed: false, 
				reason: 'Listing cannot be edited in current state',
				listing 
			};
		}

		return { allowed: true, listing };
	} catch (error) {
		console.error('Error checking edit permissions:', error);
		return { allowed: false, reason: 'Permission check failed' };
	}
}

/**
 * Check if user can delete a listing
 */
export async function canDeleteListing(userId: string, listingId: string): Promise<{
	allowed: boolean;
	reason?: string;
	listing?: any;
}> {
	try {
		const { data: listing, error } = await supabase
			.from('listings')
			.select('*')
			.eq('id', listingId)
			.eq('seller_id', userId)
			.single();

		if (error || !listing) {
			return { allowed: false, reason: 'Listing not found or access denied' };
		}

		// Check if listing can be deleted
		if (listing.status === 'active' || listing.status === 'ended') {
			return { 
				allowed: false, 
				reason: 'Cannot delete active or ended listings',
				listing 
			};
		}

		return { allowed: true, listing };
	} catch (error) {
		console.error('Error checking delete permissions:', error);
		return { allowed: false, reason: 'Permission check failed' };
	}
}

/**
 * Validate listing data
 */
export function validateListingData(data: any): {
	valid: boolean;
	errors?: string[];
	parsedData?: ListingData;
} {
	try {
		const parsedData = ListingSchema.parse(data);
		return { valid: true, parsedData };
	} catch (error) {
		if (error instanceof z.ZodError) {
			const errors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
			return { valid: false, errors };
		}
		return { valid: false, errors: ['Invalid listing data'] };
	}
}

/**
 * Create a new listing
 */
export async function createListing(userId: string, data: ListingData): Promise<{
	success: boolean;
	listing?: any;
	error?: string;
}> {
	try {
		// Check permissions
		const permissionCheck = await canCreateListing(userId);
		if (!permissionCheck.allowed) {
			return { success: false, error: permissionCheck.reason };
		}

		// Validate data
		const validation = validateListingData(data);
		if (!validation.valid) {
			return { success: false, error: validation.errors?.join(', ') };
		}

		// Validate dates
		const startAt = new Date(data.start_at);
		const endAt = new Date(data.end_at);
		const now = new Date();

		if (startAt <= now) {
			return { success: false, error: 'Start date must be in the future' };
		}

		if (endAt <= startAt) {
			return { success: false, error: 'End date must be after start date' };
		}

		// Validate pricing
		if (data.reserve_cents && data.reserve_cents <= data.start_cents) {
			return { success: false, error: 'Reserve price must be higher than starting price' };
		}

		if (data.buy_now_cents && data.buy_now_cents <= data.start_cents) {
			return { success: false, error: 'Buy now price must be higher than starting price' };
		}

		// Create listing
		const { data: listing, error } = await supabase
			.from('listings')
			.insert({
				seller_id: userId,
				...data,
				status: 'draft'
			})
			.select()
			.single();

		if (error) {
			console.error('Error creating listing:', error);
			return { success: false, error: 'Failed to create listing' };
		}

		return { success: true, listing };
	} catch (error) {
		console.error('Error creating listing:', error);
		return { success: false, error: 'Failed to create listing' };
	}
}

/**
 * Update a listing
 */
export async function updateListing(
	userId: string,
	listingId: string,
	data: ListingUpdateData
): Promise<{
	success: boolean;
	listing?: any;
	error?: string;
}> {
	try {
		// Check permissions
		const permissionCheck = await canEditListing(userId, listingId);
		if (!permissionCheck.allowed) {
			return { success: false, error: permissionCheck.reason };
		}

		// Validate data
		if (Object.keys(data).length === 0) {
			return { success: false, error: 'No data provided for update' };
		}

		// Partial validation for updates
		const updateSchema = ListingUpdateSchema;
		const validation = updateSchema.safeParse(data);
		if (!validation.success) {
			const errors = validation.error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
			return { success: false, error: errors.join(', ') };
		}

		// Additional validation for dates if provided
		if (data.start_at || data.end_at) {
			const currentListing = permissionCheck.listing;
			const newStartAt = data.start_at ? new Date(data.start_at) : new Date(currentListing.start_at);
			const newEndAt = data.end_at ? new Date(data.end_at) : new Date(currentListing.end_at);
			const now = new Date();

			if (newStartAt <= now) {
				return { success: false, error: 'Start date must be in the future' };
			}

			if (newEndAt <= newStartAt) {
				return { success: false, error: 'End date must be after start date' };
			}
		}

		// Update listing
		const { data: listing, error } = await supabase
			.from('listings')
			.update({
				...data,
				updated_at: new Date().toISOString()
			})
			.eq('id', listingId)
			.eq('seller_id', userId)
			.select()
			.single();

		if (error) {
			console.error('Error updating listing:', error);
			return { success: false, error: 'Failed to update listing' };
		}

		return { success: true, listing };
	} catch (error) {
		console.error('Error updating listing:', error);
		return { success: false, error: 'Failed to update listing' };
	}
}

/**
 * Delete a listing
 */
export async function deleteListing(userId: string, listingId: string): Promise<{
	success: boolean;
	error?: string;
}> {
	try {
		// Check permissions
		const permissionCheck = await canDeleteListing(userId, listingId);
		if (!permissionCheck.allowed) {
			return { success: false, error: permissionCheck.reason };
		}

		// Delete listing
		const { error } = await supabase
			.from('listings')
			.delete()
			.eq('id', listingId)
			.eq('seller_id', userId);

		if (error) {
			console.error('Error deleting listing:', error);
			return { success: false, error: 'Failed to delete listing' };
		}

		return { success: true };
	} catch (error) {
		console.error('Error deleting listing:', error);
		return { success: false, error: 'Failed to delete listing' };
	}
}

/**
 * Get listing by ID with seller info
 */
export async function getListing(listingId: string): Promise<{
	success: boolean;
	listing?: any;
	error?: string;
}> {
	try {
		const { data: listing, error } = await supabase
			.from('listings')
			.select(`
				*,
				users!listings_seller_id_fkey (
					id,
					email,
					legal_name,
					kyc,
					created_at
				)
			`)
			.eq('id', listingId)
			.single();

		if (error) {
			console.error('Error fetching listing:', error);
			return { success: false, error: 'Listing not found' };
		}

		return { success: true, listing };
	} catch (error) {
		console.error('Error fetching listing:', error);
		return { success: false, error: 'Failed to fetch listing' };
	}
}

/**
 * Get user's listings
 */
export async function getUserListings(userId: string, status?: string): Promise<{
	success: boolean;
	listings?: any[];
	error?: string;
}> {
	try {
		let query = supabase
			.from('listings')
			.select('*')
			.eq('seller_id', userId)
			.order('created_at', { ascending: false });

		if (status) {
			query = query.eq('status', status);
		}

		const { data: listings, error } = await query;

		if (error) {
			console.error('Error fetching user listings:', error);
			return { success: false, error: 'Failed to fetch listings' };
		}

		return { success: true, listings };
	} catch (error) {
		console.error('Error fetching user listings:', error);
		return { success: false, error: 'Failed to fetch listings' };
	}
}

/**
 * Search listings with filters
 */
export async function searchListings(filters: {
	category_id?: number;
	condition?: string;
	state?: string;
	min_price?: number;
	max_price?: number;
	search?: string;
	status?: string;
}): Promise<{
	success: boolean;
	listings?: any[];
	error?: string;
}> {
	try {
		let query = supabase
			.from('listings')
			.select(`
				*,
				users!listings_seller_id_fkey (
					id,
					legal_name,
					kyc
				)
			`)
			.eq('status', 'active')
			.order('created_at', { ascending: false });

		// Apply filters
		if (filters.category_id) {
			query = query.eq('category_id', filters.category_id);
		}

		if (filters.condition) {
			query = query.eq('condition', filters.condition);
		}

		if (filters.state) {
			query = query.eq('location->state', filters.state);
		}

		if (filters.min_price) {
			query = query.gte('start_cents', filters.min_price * 100);
		}

		if (filters.max_price) {
			query = query.lte('start_cents', filters.max_price * 100);
		}

		if (filters.search) {
			query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
		}

		const { data: listings, error } = await query;

		if (error) {
			console.error('Error searching listings:', error);
			return { success: false, error: 'Failed to search listings' };
		}

		return { success: true, listings };
	} catch (error) {
		console.error('Error searching listings:', error);
		return { success: false, error: 'Failed to search listings' };
	}
}

/**
 * Get category by ID
 */
export function getCategory(categoryId: number) {
	return CATEGORIES.find(cat => cat.id === categoryId);
}

/**
 * Get condition by ID
 */
export function getCondition(conditionId: string) {
	return CONDITIONS.find(cond => cond.id === conditionId);
}

/**
 * Format price from cents to dollars
 */
export function formatPrice(cents: number): string {
	return new Intl.NumberFormat('en-AU', {
		style: 'currency',
		currency: 'AUD'
	}).format(cents / 100);
}

/**
 * Calculate time left until auction ends
 */
export function getTimeLeft(endAt: string): {
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	ended: boolean;
} {
	const now = new Date();
	const end = new Date(endAt);
	const diff = end.getTime() - now.getTime();

	if (diff <= 0) {
		return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true };
	}

	const days = Math.floor(diff / (1000 * 60 * 60 * 24));
	const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
	const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
	const seconds = Math.floor((diff % (1000 * 60)) / 1000);

	return { days, hours, minutes, seconds, ended: false };
}
