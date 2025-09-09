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
import { getSessionUserFromLocals, validateUserAccess } from '$lib/session';
import { ApiErrorHandler } from '$lib/api-error-handler';
import { recordBusinessEvent } from '$lib/server/kpi-metrics-server';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserFromLocals(locals);

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
			await recordBusinessEvent(
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
		// Handle authentication errors gracefully
		if (error instanceof Response) {
			return error;
		}
		return ApiErrorHandler.handleError(error as Error, { request, locals, url }, {
			operation: 'create_listing',
			userId: undefined // User not available in catch scope
		});
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
			await validateUserAccess({ request, locals, url }, userId);

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
		// Handle authentication errors gracefully
		if (error instanceof Response) {
			return error;
		}
		return ApiErrorHandler.handleError(error as Error, { request, locals, url }, {
			operation: 'get_listings',
			userId: undefined // User not available in catch scope
		});
	}
};
