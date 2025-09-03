import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateListing, deleteListing, getListing } from '$lib/listings';
import { mapApiErrorToMessage } from '$lib/errors';
import { validate, ListingUpdateSchema } from '$lib/validation';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { listingId } = params;

		if (!listingId) {
			return json({ error: 'Listing ID required' }, { status: 400 });
		}

		const result = await getListing(listingId);

		if (!result.success) {
			return json({ error: mapApiErrorToMessage(result.error) }, { status: 404 });
		}

		return json({
			success: true,
			listing: result.listing
		});

	} catch (error) {
		console.error('Listing retrieval error:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request, params, locals }) => {
	try {
		// Verify user is authenticated
		const session = await locals.getSession();
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { listingId } = params;
		if (!listingId) {
			return json({ error: 'Listing ID required' }, { status: 400 });
		}

		const raw = await request.json();
		const parsed = validate(ListingUpdateSchema, raw);
		if (!parsed.ok) {
			return json({ error: mapApiErrorToMessage(parsed.error) }, { status: 400 });
		}

		// Update listing
		const result = await updateListing(session.user.id, listingId, parsed.value as any);

		if (!result.success) {
			return json({ error: mapApiErrorToMessage(result.error) }, { status: 400 });
		}

		return json({
			success: true,
			listing: result.listing
		});

	} catch (error) {
		console.error('Listing update error:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		// Verify user is authenticated
		const session = await locals.getSession();
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { listingId } = params;
		if (!listingId) {
			return json({ error: 'Listing ID required' }, { status: 400 });
		}

		// Delete listing
		const result = await deleteListing(session.user.id, listingId);

		if (!result.success) {
			return json({ error: mapApiErrorToMessage(result.error) }, { status: 400 });
		}

		return json({ success: true });

	} catch (error) {
		console.error('Listing deletion error:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};
