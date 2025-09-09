import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import type { RequestHandler } from './$types';
import { 
	uploadListingPhoto, 
	uploadEvidenceFile, 
	uploadProfileAvatar,
	uploadAddressProof,
	validateFile,
	validateProofFile,
	checkDuplicateImage,
	STORAGE_BUCKETS
} from '$lib/storage';
import { supabase } from '$lib/supabase';
import { rateLimit } from '$lib/security';
import { validate, StorageUploadSchema } from '$lib/validation';
import { getSessionUserFromLocals } from '$lib/session';
import { ApiErrorHandler } from '$lib/api-error-handler';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserFromLocals(locals);

		// Rate limit uploads per user (e.g., 60/minute overall)
		const rl = rateLimit(`upload:${user.id}`, 60, 60_000);
		if (!rl.allowed) {
			return json(
				{ error: 'Too many uploads. Please slow down.' },
				{ status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} }
			);
		}

		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		const raw = {
			type: formData.get('type') as string | null,
			listingId: formData.get('listingId') as string | null,
			disputeId: formData.get('disputeId') as string | null,
			orderIndex: formData.get('orderIndex') as string | number | null
		};
		const parsed = validate(StorageUploadSchema, {
			type: raw.type ?? undefined,
			listingId: raw.listingId ?? undefined,
			disputeId: raw.disputeId ?? undefined,
			orderIndex: raw.orderIndex ?? undefined
		});
		if (!parsed.ok) {
			return json({ error: parsed.error }, { status: 400 });
		}
		const { type, listingId, disputeId, orderIndex } = parsed.value;

		if (!file) {
			return json({ error: 'Missing file' }, { status: 400 });
		}

		// Validate file
		const validation = (type === 'address_proof') ? validateProofFile(file) : validateFile(file);
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

				if (!listing || listing.seller_id !== user.id) {
					return json({ error: 'Unauthorized' }, { status: 403 });
				}

				// Pre-check: if we can hash before upload, do it
				// Note: uploadImage will also generate a hash; this is an early exit safeguard
				try {
					const maybeHash = undefined; // keep API compatible; hash generated inside uploadListingPhoto
					if (maybeHash) {
						const isDuplicate = await checkDuplicateImage(maybeHash as any, listingId);
						if (isDuplicate) {
							return json({ error: 'Duplicate image detected' }, { status: 400 });
						}
					}
				} catch {
					// ignore pre-check failures
				}

				uploadResult = await uploadListingPhoto(file, listingId, orderIndex);
				break;

			case 'address_proof':
				// Proof of address goes to private bucket under user id
				uploadResult = await uploadAddressProof(file, user.id);
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

				if (!dispute || (dispute.buyer_id !== user.id && dispute.seller_id !== user.id)) {
					return json({ error: 'Unauthorized' }, { status: 403 });
				}

				uploadResult = await uploadEvidenceFile(file, disputeId, user.id);
				break;

			case 'profile_avatar':
				uploadResult = await uploadProfileAvatar(file, user.id);
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
		// Handle authentication errors gracefully
		if (error instanceof Response) {
			return error;
		}
		return ApiErrorHandler.handleError(error as Error, { request, locals, url }, {
			operation: 'file_upload',
			userId: undefined // User not available in catch scope
		});
	}
};
