import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import { supabase } from '$lib/supabase';
import { isAdmin, createAdminAuditLog } from '$lib/admin';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/security';
import { validate } from '$lib/validation';
import { z } from 'zod';

// Validation schema for manual finalize request
const ManualFinalizeSchema = z.object({
	auctionId: z.string().uuid().optional(),
	force: z.boolean().optional().default(false),
	reason: z.string().min(10).max(500)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Verify user is authenticated
		const sessionResp = await locals.getSession();
		const sessionUser = (sessionResp as any)?.data?.session?.user 
			?? (sessionResp as any)?.session?.user 
			?? (sessionResp as any)?.user 
			?? null;
		const session = sessionUser ? { user: sessionUser } : null;
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Check admin privileges
		const adminCheck = await isAdmin(session.user.id);
		if (!adminCheck.allowed) {
			return json({ error: adminCheck.reason }, { status: 403 });
		}

		// Rate limit admin actions (5 per minute)
		const rl = rateLimit(`admin-finalize:${session.user.id}`, 5, 60_000);
		if (!rl.allowed) {
			return json(
				{ error: 'Too many admin actions. Please slow down.' },
				{ status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} }
			);
		}

		// Validate request body
		const parsed = validate(ManualFinalizeSchema, await request.json());
		if (!parsed.ok) {
			return json({ error: mapApiErrorToMessage(parsed.error) }, { status: 400 });
		}
		const { auctionId, force, reason } = parsed.value;

		// Create audit log entry
		const auditLog = createAdminAuditLog(
			session.user.id,
			'manual_finalize_auctions',
			{ auctionId, force, reason },
			auctionId
		);

		let result;

		if (auctionId) {
			// Finalize specific auction
			result = await finalizeSpecificAuction(auctionId, force, reason);
		} else {
			// Finalize all expired auctions
			result = await finalizeAllExpiredAuctions(force, reason);
		}

		// Log the admin action
		console.log('Admin manual finalize:', {
			adminId: session.user.id,
			adminEmail: adminCheck.userProfile?.email,
			action: 'manual_finalize_auctions',
			details: { auctionId, force, reason },
			result
		});

		return json({
			success: true,
			result,
			auditLog,
			message: auctionId 
				? `Auction ${auctionId} finalization ${result.success ? 'completed' : 'failed'}`
				: `Processed ${result.processed || 0} expired auctions`
		});

	} catch (error) {
		console.error('Admin finalize error:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};

/**
 * Finalize a specific auction manually
 */
async function finalizeSpecificAuction(auctionId: string, force: boolean, reason: string) {
	try {
		// Get auction details
		const { data: auction, error: auctionError } = await supabase
			.from('auctions')
			.select(`
				id,
				listing_id,
				status,
				high_bid_id,
				listings!inner(
					id,
					title,
					seller_id,
					end_at
				)
			`)
			.eq('id', auctionId)
			.single();

		if (auctionError || !auction) {
			return {
				success: false,
				error: 'Auction not found',
				auctionId
			};
		}

		// Check if auction is already ended
		if (auction.status === 'ended') {
			return {
				success: false,
				error: 'Auction already ended',
				auctionId,
				status: auction.status
			};
		}

		// Check if auction has expired (unless force is true)
		const now = new Date();
		const endAt = new Date(auction.listings.end_at);
		if (!force && now < endAt) {
			return {
				success: false,
				error: 'Auction has not expired yet. Use force=true to override.',
				auctionId,
				endAt: auction.listings.end_at,
				now: now.toISOString()
			};
		}

		// Call the end_auction function
		const { data: finalizeResult, error: finalizeError } = await supabase
			.rpc('end_auction', { auction_id: auctionId });

		if (finalizeError) {
			return {
				success: false,
				error: finalizeError.message,
				auctionId
			};
		}

		return {
			success: true,
			auctionId,
			result: finalizeResult,
			force,
			reason
		};

	} catch (error) {
		console.error('Error finalizing specific auction:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			auctionId
		};
	}
}

/**
 * Finalize all expired auctions manually
 */
async function finalizeAllExpiredAuctions(force: boolean, reason: string) {
	try {
		// Call the end_expired_auctions function
		const { data: result, error } = await supabase
			.rpc('end_expired_auctions');

		if (error) {
			return {
				success: false,
				error: error.message,
				processed: 0
			};
		}

		return {
			success: true,
			result,
			processed: result?.auctions_processed || 0,
			force,
			reason
		};

	} catch (error) {
		console.error('Error finalizing expired auctions:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			processed: 0
		};
	}
}

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		// Verify user is authenticated
		const sessionResp = await locals.getSession();
		const sessionUser = (sessionResp as any)?.data?.session?.user 
			?? (sessionResp as any)?.session?.user 
			?? (sessionResp as any)?.user 
			?? null;
		const session = sessionUser ? { user: sessionUser } : null;
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Check admin privileges
		const adminCheck = await isAdmin(session.user.id);
		if (!adminCheck.allowed) {
			return json({ error: adminCheck.reason }, { status: 403 });
		}

		const action = url.searchParams.get('action');

		if (action === 'status') {
			// Get status of expired auctions
			const { data: expiredAuctions, error } = await supabase
				.from('auctions')
				.select(`
					id,
					listing_id,
					status,
					high_bid_id,
					listings!inner(
						id,
						title,
						seller_id,
						end_at
					)
				`)
				.eq('status', 'live')
				.lt('listings.end_at', new Date().toISOString());

			if (error) {
				return json({ error: 'Failed to fetch expired auctions' }, { status: 500 });
			}

			return json({
				success: true,
				expiredAuctions: expiredAuctions || [],
				count: expiredAuctions?.length || 0
			});
		}

		return json({ error: 'Invalid action' }, { status: 400 });

	} catch (error) {
		console.error('Admin status check error:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};
