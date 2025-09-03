import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import type { RequestHandler } from './$types';
import { 
	uploadListingPhoto, 
	uploadEvidenceFile, 
	uploadProfileAvatar,
	validateFile,
	checkDuplicateImage,
	STORAGE_BUCKETS
} from '$lib/storage';
import { supabase } from '$lib/supabase';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Verify user is authenticated
		const session = await locals.getSession();
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const formData = await request.formData();
		const file = formData.get('file') as File;
		const type = formData.get('type') as string;
		const listingId = formData.get('listingId') as string;
		const disputeId = formData.get('disputeId') as string;
		const orderIndex = parseInt(formData.get('orderIndex') as string) || 0;

		if (!file || !type) {
			return json({ error: 'Missing file or type' }, { status: 400 });
		}

		// Validate file
		const validation = validateFile(file);
		if (!validation.valid) {
			return json({ error: validation.error }, { status: 400 });
		}

		let uploadResult;

		switch (type) {
			case 'listing_photo':
				if (!listingId) {
					return json({ error: 'Missing listingId for listing photo' }, { status: 400 });
				}

				// Check if user owns the listing
				const { data: listing } = await supabase
					.from('listings')
					.select('seller_id')
					.eq('id', listingId)
					.single();

				if (!listing || listing.seller_id !== session.user.id) {
					return json({ error: 'Unauthorized' }, { status: 403 });
				}

				// Check for duplicate image
				if (uploadResult?.hash) {
					const isDuplicate = await checkDuplicateImage(uploadResult.hash, listingId);
					if (isDuplicate) {
						return json({ error: 'Duplicate image detected' }, { status: 400 });
					}
				}

				uploadResult = await uploadListingPhoto(file, listingId, orderIndex);
				break;

			case 'evidence_file':
				if (!disputeId) {
					return json({ error: 'Missing disputeId for evidence file' }, { status: 400 });
				}

				// Check if user is involved in the dispute
				const { data: dispute } = await supabase
					.from('disputes')
					.select('buyer_id, seller_id')
					.eq('id', disputeId)
					.single();

				if (!dispute || (dispute.buyer_id !== session.user.id && dispute.seller_id !== session.user.id)) {
					return json({ error: 'Unauthorized' }, { status: 403 });
				}

				uploadResult = await uploadEvidenceFile(file, disputeId, session.user.id);
				break;

			case 'profile_avatar':
				uploadResult = await uploadProfileAvatar(file, session.user.id);
				break;

			default:
				return json({ error: 'Invalid upload type' }, { status: 400 });
		}

		// Save to database if it's a listing photo
		if (type === 'listing_photo' && uploadResult) {
			const { error: dbError } = await supabase
				.from('listing_photos')
				.insert({
					listing_id: listingId,
					url: uploadResult.url,
					path: uploadResult.path,
					order_idx: orderIndex,
					perceptual_hash: uploadResult.hash,
					file_size: uploadResult.metadata.size,
					mime_type: uploadResult.metadata.type
				});

			if (dbError) {
				console.error('Database error:', dbError);
				// Don't fail the upload, just log the error
			}
		}

		return json({
			success: true,
			url: uploadResult.url,
			path: uploadResult.path,
			hash: uploadResult.hash,
			metadata: uploadResult.metadata
		});

	} catch (error) {
		console.error('Upload error:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};
