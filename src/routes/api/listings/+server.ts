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
import { mapApiErrorToMessage } from '$lib/errors';
import { validate, ListingCreateSchema, SearchSchema } from '$lib/validation';
import { getSessionUserOrThrow, validateUserAccess } from '$lib/session';
import { recordListingCreated } from '$lib/server/kpi-metrics-server';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserOrThrow({ request, locals } as any);

		// Rate limit listing creation per user (e.g., 5 creates per hour)
		const rl = rateLimit(`create-listing:${user.id}`, 5, 60 * 60_000);
		if (!rl.allowed) {
			return json(
				{ error: 'Too many listing creations. Please try later.' },
				{ status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} }
			);
		}

		const raw = await request.json();
		const parsed = validate(ListingCreateSchema, raw);
		if (!parsed.ok) {
			return json({ error: mapApiErrorToMessage(parsed.error) }, { status: 400 });
		}

		// Create listing
		const result = await createListing(user.id, parsed.value as any);

		if (!result.success) {
			return json({ error: mapApiErrorToMessage(result.error) }, { status: 400 });
		}

		// Record KPI metrics for successful listing creation
		try {
			await recordListingCreated(
				'listing_created',
				'listings_created',
				1,
				'count',
				{
					userId: user.id,
					listingId: result.listing?.id,
					tags: {
						category: parsed.value.category,
						condition: parsed.value.condition
					}
				}
			);
		} catch (error) {
			console.error('Failed to record listing creation KPI:', error);
			// Don't fail the request if KPI recording fails
		}

		return json({
			success: true,
			listing: result.listing
		});

	} catch (error) {
		console.error('Listing creation error:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url, locals, request }) => {
	try {
		const action = url.searchParams.get('action');
		const listingId = url.searchParams.get('listingId');
		const userId = url.searchParams.get('userId');
		const status = url.searchParams.get('status');

		// Get specific listing
		if (action === 'get' && listingId) {
			const result = await getListing(listingId);
			
			if (!result.success) {
				return json({ error: mapApiErrorToMessage(result.error) }, { status: 404 });
			}

			return json({
				success: true,
				listing: result.listing
			});
		}

		// Get user's listings
		if (action === 'user' && userId) {
			// Verify user is authenticated and requesting their own listings
			await validateUserAccess({ request, locals } as any, userId);

			const result = await getUserListings(userId, status || undefined);
			
			if (!result.success) {
				return json({ error: mapApiErrorToMessage(result.error) }, { status: 500 });
			}

			return json({
				success: true,
				listings: result.listings
			});
		}

		// Search listings
		if (action === 'search') {
			const filtersObj = Object.fromEntries(url.searchParams.entries());
			const parsedSearch = validate(SearchSchema, filtersObj);
			if (!parsedSearch.ok) {
				return json({ error: mapApiErrorToMessage(parsedSearch.error) }, { status: 400 });
			}

			const result = await searchListings(parsedSearch.value as any);
			
			if (!result.success) {
				return json({ error: mapApiErrorToMessage(result.error) }, { status: 500 });
			}

			return json({
				success: true,
				listings: result.listings
			});
		}

		return json({ error: 'Invalid action' }, { status: 400 });

	} catch (error) {
		console.error('Listing retrieval error:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};
