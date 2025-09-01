import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateListing, deleteListing, getListing } from '$lib/listings';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { listingId } = params;

		if (!listingId) {
			return json({ error: 'Listing ID required' }, { status: 400 });
		}

		const result = await getListing(listingId);

		if (!result.success) {
			return json({ error: result.error }, { status: 404 });
		}

		return json({
			success: true,
			listing: result.listing
		});

	} catch (error) {
		console.error('Listing retrieval error:', error);
		return json({ error: 'Failed to retrieve listing' }, { status: 500 });
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

		const updateData = await request.json();

		// Update listing
		const result = await updateListing(session.user.id, listingId, updateData);

		if (!result.success) {
			return json({ error: result.error }, { status: 400 });
		}

		return json({
			success: true,
			listing: result.listing
		});

	} catch (error) {
		console.error('Listing update error:', error);
		return json({ error: 'Failed to update listing' }, { status: 500 });
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
			return json({ error: result.error }, { status: 400 });
		}

		return json({ success: true });

	} catch (error) {
		console.error('Listing deletion error:', error);
		return json({ error: 'Failed to delete listing' }, { status: 500 });
	}
};
