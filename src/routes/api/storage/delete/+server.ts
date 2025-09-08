import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import type { RequestHandler } from './$types';
import { deleteFile, STORAGE_BUCKETS } from '$lib/storage';
import { supabase } from '$lib/supabase';
import { rateLimit } from '$lib/security';
import { validate, StorageDeleteSchema } from '$lib/validation';
import { getSessionUserOrThrow } from '$lib/session';

export const DELETE: RequestHandler = async ({ request, locals }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserOrThrow({ request, locals } as any);

		// Rate limit deletes per user (e.g., 30/minute)
		const rl = rateLimit(`delete:${user.id}`, 30, 60_000);
		if (!rl.allowed) {
			return json(
				{ error: 'Too many delete requests. Please slow down.' },
				{ status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} }
			);
		}

		const parsed = validate(StorageDeleteSchema, await request.json());
		if (!parsed.ok) return json({ error: mapApiErrorToMessage(parsed.error) }, { status: 400 });
		const { bucket, path, photoId, listingId } = parsed.value as any;

		if (!bucket || !path) {
			return json({ error: 'Missing bucket or path' }, { status: 400 });
		}

		// Validate bucket
		if (!Object.values(STORAGE_BUCKETS).includes(bucket)) {
			return json({ error: 'Invalid bucket' }, { status: 400 });
		}

		// Check permissions based on bucket type
		switch (bucket) {
			case STORAGE_BUCKETS.LISTING_PHOTOS:
				if (!listingId) {
					return json({ error: 'Missing listingId for listing photo' }, { status: 400 });
				}

				// Check if user owns the listing
				const { data: listing } = await supabase
					.from('listings')
					.select('seller_id')
					.eq('id', listingId)
					.single();

				if (!listing || listing.seller_id !== user.id) {
					return json({ error: 'Unauthorized' }, { status: 403 });
				}

				// Delete from database if photoId provided
				if (photoId) {
					const { error: dbError } = await supabase
						.from('listing_photos')
						.delete()
						.eq('id', photoId)
						.eq('listing_id', listingId);

					if (dbError) {
						console.error('Database delete error:', dbError);
						return json({ error: 'Failed to delete from database' }, { status: 500 });
					}
				}
				break;

			case STORAGE_BUCKETS.ADDRESS_PROOFS:
				// Only the owner can delete their own proof files
				const proofUserId = path.split('/')[0];
				if (proofUserId !== user.id) {
					return json({ error: 'Unauthorized' }, { status: 403 });
				}
				break;

			case STORAGE_BUCKETS.EVIDENCE_UPLOADS:
				// For evidence files, check if user is involved in the dispute
				// Extract disputeId from path (format: disputeId/userId_filename)
				const pathParts = path.split('/');
				if (pathParts.length >= 2) {
					const disputeId = pathParts[0];
					const userId = pathParts[1].split('_')[0];

					if (userId !== user.id) {
						const { data: dispute } = await supabase
							.from('disputes')
							.select('buyer_id, seller_id')
							.eq('id', disputeId)
							.single();

						if (!dispute || (dispute.buyer_id !== user.id && dispute.seller_id !== user.id)) {
							return json({ error: 'Unauthorized' }, { status: 403 });
						}
					}
				}
				break;

			case STORAGE_BUCKETS.PROFILE_AVATARS:
				// Check if user owns the avatar
				const pathUserId = path.split('/')[0];
				if (pathUserId !== user.id) {
					return json({ error: 'Unauthorized' }, { status: 403 });
				}
				break;

			default:
				return json({ error: 'Invalid bucket type' }, { status: 400 });
		}

		// Delete from storage
		await deleteFile(bucket, path);

		return json({ success: true });

	} catch (error) {
		console.error('Delete error:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};
