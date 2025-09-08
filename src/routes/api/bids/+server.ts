import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import type { RequestHandler } from './$types';
import { 
	canBidOnListing, 
	validateBidAmount, 
	getCurrentBid, 
	getBidHistory,
	getUserBids,
	isUserWinning,
	type BidData
} from '$lib/auctions';
import { rateLimit } from '$lib/security';
import { validate, BidSchema } from '$lib/validation';
import { getSessionUserOrThrow, validateUserAccess } from '$lib/session';
import { recordBidPlaced } from '$lib/kpi-metrics';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserOrThrow({ request, locals } as any);

		// Rate limit bid placements per user (e.g., 10 bids per minute)
		const rl = rateLimit(`bids:${user.id}`, 10, 60_000);
		if (!rl.allowed) {
			return json(
				{ error: 'Too many requests. Please slow down.' },
				{ status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} }
			);
		}

		const parsed = validate(BidSchema, await request.json());
		if (!parsed.ok) {
			return json({ error: mapApiErrorToMessage(parsed.error) }, { status: 400 });
		}
		const { listingId, amount_cents, proxy_max_cents } = parsed.value as any;

		// listingId and amount validated by schema

		// Check if user can bid on this listing
		const permissionCheck = await canBidOnListing(user.id, listingId);
		if (!permissionCheck.allowed) {
			return json({ error: permissionCheck.reason }, { status: 400 });
		}

		// Get current bid to validate amount
		const currentBidResult = await getCurrentBid(listingId);
		if (!currentBidResult.success) {
			return json({ error: 'Failed to get current bid information' }, { status: 500 });
		}

		const currentBidCents = currentBidResult.bid?.amount_cents || 0;
		const reserveCents = permissionCheck.listing?.reserve_cents;

		// Validate bid amount
		const validation = validateBidAmount(amount_cents, currentBidCents, reserveCents);
		if (!validation.valid) {
			return json({ 
				error: validation.reason,
				minimumBid: validation.minimumBid 
			}, { status: 400 });
		}

		// Call the canonical auctions-centric place_bid RPC
		let rpcResult: any = null;
		let rpcError: any = null;

		// Lookup auction by listing_id; if missing, treat as error
		const { data: auctionRow, error: auctionLookupError } = await locals.supabase
			.from('auctions')
			.select('id')
			.eq('listing_id', listingId)
			.single();

		if (auctionLookupError || !auctionRow?.id) {
			return json({ error: 'Auction not found for listing' }, { status: 400 });
		}

		const { data, error } = await locals.supabase.rpc('place_bid', {
			auction_id: auctionRow.id,
			amount_cents,
			max_proxy_cents: proxy_max_cents || null
		});
		rpcResult = data;
		rpcError = error;

		if (rpcError) {
			console.error('place_bid RPC error:', rpcError);
			return json({ error: 'Failed to place bid' }, { status: 500 });
		}

		// Parse the JSON result
		const bidResult = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;

		if (!bidResult.success) {
			return json({ error: bidResult.error }, { status: 400 });
		}

		return json({
			success: true,
			bid: {
				id: bidResult.bid_id,
				amount_cents: bidResult.amount_cents,
				is_proxy_bid: bidResult.is_proxy_bid,
				outbid_previous: bidResult.outbid_previous,
				extension_seconds: bidResult.extension_seconds,
				new_end_at: bidResult.new_end_at,
				previous_bidder_id: bidResult.previous_bidder_id,
				previous_amount_cents: bidResult.previous_amount_cents
			}
		});

	} catch (error) {
		console.error('Bid placement error:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url, locals, request }) => {
	try {
		const action = url.searchParams.get('action');
		const listingId = url.searchParams.get('listingId');
		const userId = url.searchParams.get('userId');

		// Get authenticated user with proper error handling
		const user = await getSessionUserOrThrow({ request, locals } as any);

		// Get current bid for a listing
		if (action === 'current' && listingId) {
			const result = await getCurrentBid(listingId);
			
			if (!result.success) {
				return json({ error: result.error }, { status: 500 });
			}

			return json({
				success: true,
				bid: result.bid
			});
		}

		// Get bid history for a listing
		if (action === 'history' && listingId) {
			const limit = parseInt(url.searchParams.get('limit') || '50');
			const result = await getBidHistory(listingId, limit);
			
			if (!result.success) {
				return json({ error: result.error }, { status: 500 });
			}

			return json({
				success: true,
				bids: result.bids
			});
		}

		// Get user's bids
		if (action === 'user' && userId) {
			// Verify user is requesting their own bids
			await validateUserAccess({ request, locals } as any, userId);

			const result = await getUserBids(userId);
			
			if (!result.success) {
				return json({ error: result.error }, { status: 500 });
			}

			return json({
				success: true,
				bids: result.bids
			});
		}

		// Check if user is winning a listing
		if (action === 'winning' && listingId && userId) {
			// Verify user is checking their own winning status
			await validateUserAccess({ request, locals } as any, userId);

			const result = await isUserWinning(userId, listingId);
			
			if (result.error) {
				return json({ error: result.error }, { status: 500 });
			}

			return json({
				success: true,
				winning: result.winning,
				bid: result.bid
			});
		}

		return json({ error: 'Invalid action' }, { status: 400 });

	} catch (error) {
		console.error('Bid retrieval error:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};
