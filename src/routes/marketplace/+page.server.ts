import { supabase } from '$lib/supabase';
import { CATEGORIES, AUSTRALIAN_STATES, CONDITIONS } from '$lib/listings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = parseInt(url.searchParams.get('limit') || '12', 10);
	const offset = (page - 1) * limit;
	
	// Get filters from URL
	const search = url.searchParams.get('search') || '';
	const category = url.searchParams.get('category') || '';
	const state = url.searchParams.get('state') || '';
	const condition = url.searchParams.get('condition') || '';
	const minPrice = url.searchParams.get('min_price');
	const maxPrice = url.searchParams.get('max_price');
	const status = url.searchParams.get('status') || 'live';
	const sort = url.searchParams.get('sort') || 'newest';

	try {
		// Build query for listings with seller info and photos
		let query = supabase
			.from('listings')
			.select(`
				*,
				users!listings_seller_id_fkey (
					id,
					legal_name,
					kyc
				),
				listing_photos (
					id,
					url,
					order_idx
				)
			`, { count: 'exact' });

		// Apply status filter - only show live auctions by default
		if (status === 'live') {
			query = query.eq('status', 'live');
		} else if (status === 'ending_soon') {
			// Auctions ending in the next 24 hours
			const tomorrow = new Date();
			tomorrow.setHours(tomorrow.getHours() + 24);
			query = query
				.eq('status', 'live')
				.lte('end_at', tomorrow.toISOString());
		} else if (status === 'ended') {
			query = query.eq('status', 'ended');
		}

		// Apply search filter
		if (search.trim()) {
			query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
		}

		// Apply category filter
		if (category && category !== 'all') {
			const categoryId = parseInt(category, 10);
			if (!isNaN(categoryId)) {
				query = query.eq('category_id', categoryId);
			}
		}

		// Apply state filter
		if (state && state !== 'all') {
			query = query.eq('location->state', state);
		}

		// Apply condition filter
		if (condition && condition !== 'all') {
			query = query.eq('condition', condition);
		}

		// Apply price filters (convert dollars to cents)
		if (minPrice && !isNaN(parseFloat(minPrice))) {
			query = query.gte('start_cents', Math.round(parseFloat(minPrice) * 100));
		}
		if (maxPrice && !isNaN(parseFloat(maxPrice))) {
			query = query.lte('start_cents', Math.round(parseFloat(maxPrice) * 100));
		}

		// Apply sorting
		switch (sort) {
			case 'price_low':
				query = query.order('start_cents', { ascending: true });
				break;
			case 'price_high':
				query = query.order('start_cents', { ascending: false });
				break;
			case 'ending_soon':
				query = query.order('end_at', { ascending: true });
				break;
			case 'newest':
			default:
				query = query.order('created_at', { ascending: false });
				break;
		}

		// Apply pagination
		query = query.range(offset, offset + limit - 1);

		const { data: listings, error, count } = await query;

		if (error) {
			console.error('Error loading listings:', error);
			return {
				listings: [],
				totalCount: 0,
				page,
				limit,
				totalPages: 0,
				filters: { search, category, state, condition, minPrice, maxPrice, status, sort },
				categories: CATEGORIES,
				states: AUSTRALIAN_STATES,
				conditions: CONDITIONS,
				error: 'Failed to load listings'
			};
		}

		const totalPages = Math.ceil((count || 0) / limit);

		return {
			listings: listings || [],
			totalCount: count || 0,
			page,
			limit,
			totalPages,
			filters: { search, category, state, condition, minPrice, maxPrice, status, sort },
			categories: CATEGORIES,
			states: AUSTRALIAN_STATES,
			conditions: CONDITIONS
		};
	} catch (error) {
		console.error('Error in marketplace load function:', error);
		return {
			listings: [],
			totalCount: 0,
			page,
			limit,
			totalPages: 0,
			filters: { search, category, state, condition, minPrice, maxPrice, status, sort },
			categories: CATEGORIES,
			states: AUSTRALIAN_STATES,
			conditions: CONDITIONS,
			error: 'Failed to load marketplace'
		};
	}
};