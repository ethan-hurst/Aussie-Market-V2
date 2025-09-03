import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { 
	createListing, 
	updateListing, 
	deleteListing, 
	getListing, 
	getUserListings, 
	searchListings,
	type ListingData,
	type ListingUpdateData
} from '$lib/listings';
import { rateLimit } from '$lib/security';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Verify user is authenticated
		const session = await locals.getSession();
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Rate limit listing creation per user (e.g., 5 creates per hour)
		const rl = rateLimit(`create-listing:${session.user.id}`, 5, 60 * 60_000);
		if (!rl.allowed) {
			return json(
				{ error: 'Too many listing creations. Please try later.' },
				{ status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} }
			);
		}

		const listingData = await request.json();

		// Create listing
		const result = await createListing(session.user.id, listingData);

		if (!result.success) {
			return json({ error: result.error }, { status: 400 });
		}

		return json({
			success: true,
			listing: result.listing
		});

	} catch (error) {
		console.error('Listing creation error:', error);
		return json({ error: 'Failed to create listing' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const action = url.searchParams.get('action');
		const listingId = url.searchParams.get('listingId');
		const userId = url.searchParams.get('userId');
		const status = url.searchParams.get('status');

		// Get specific listing
		if (action === 'get' && listingId) {
			const result = await getListing(listingId);
			
			if (!result.success) {
				return json({ error: result.error }, { status: 404 });
			}

			return json({
				success: true,
				listing: result.listing
			});
		}

		// Get user's listings
		if (action === 'user' && userId) {
			// Verify user is authenticated and requesting their own listings
			const session = await locals.getSession();
			if (!session || session.user.id !== userId) {
				return json({ error: 'Unauthorized' }, { status: 401 });
			}

			const result = await getUserListings(userId, status || undefined);
			
			if (!result.success) {
				return json({ error: result.error }, { status: 500 });
			}

			return json({
				success: true,
				listings: result.listings
			});
		}

		// Search listings
		if (action === 'search') {
			const filters = {
				category_id: url.searchParams.get('category_id') ? parseInt(url.searchParams.get('category_id')!) : undefined,
				condition: url.searchParams.get('condition') || undefined,
				state: url.searchParams.get('state') || undefined,
				min_price: url.searchParams.get('min_price') ? parseFloat(url.searchParams.get('min_price')!) : undefined,
				max_price: url.searchParams.get('max_price') ? parseFloat(url.searchParams.get('max_price')!) : undefined,
				search: url.searchParams.get('search') || undefined,
				status: url.searchParams.get('status') || undefined
			};

			const result = await searchListings(filters);
			
			if (!result.success) {
				return json({ error: result.error }, { status: 500 });
			}

			return json({
				success: true,
				listings: result.listings
			});
		}

		return json({ error: 'Invalid action' }, { status: 400 });

	} catch (error) {
		console.error('Listing retrieval error:', error);
		return json({ error: 'Failed to retrieve listings' }, { status: 500 });
	}
};
