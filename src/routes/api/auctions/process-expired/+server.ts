import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';
import type { RequestHandler } from './$types';

/**
 * API endpoint to process expired auctions
 * This can be called by:
 * - Cron jobs
 * - Cloud schedulers (Cloudflare, Vercel, etc.)
 * - Manual triggers for testing
 * - The Supabase Edge Function as a backup
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Get authenticated user (optional - could be called by system)
		const { data: { session } } = await locals.getSession();

		// For security, you might want to restrict this to admin users or service accounts
		// For now, we'll allow authenticated users to call this for testing

		console.log('Processing expired auctions via API endpoint');

		// Call the database function to process all expired auctions
		const { data: result, error } = await supabase.rpc('end_expired_auctions');

		if (error) {
			console.error('Error processing expired auctions:', error);
			return json(
				{
					error: 'Failed to process expired auctions',
					details: error.message
				},
				{ status: 500 }
			);
		}

		console.log('Expired auctions processing result:', result);

		// Log the processing for monitoring
		await supabase
			.from('metrics')
			.insert({
				metric_type: 'auction_processing',
				metric_name: 'api_triggered_processing',
				value: result?.auctions_processed || 0,
				metadata: result,
				recorded_at: new Date().toISOString()
			});

		return json({
			success: true,
			message: 'Expired auctions processed successfully',
			result
		});

	} catch (error) {
		console.error('Unexpected error processing expired auctions:', error);
		return json(
			{
				error: 'Unexpected error occurred',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

/**
 * GET endpoint to check auction processing status
 */
export const GET: RequestHandler = async () => {
	try {
		// Get count of expired auctions that need processing
		const { count: expiredCount, error: countError } = await supabase
			.from('auctions')
			.select('id, listings!inner(end_at)', { count: 'exact', head: true })
			.eq('status', 'live')
			.lt('listings.end_at', new Date().toISOString());

		if (countError) {
			console.error('Error getting expired auction count:', countError);
			return json({ error: 'Failed to get auction status' }, { status: 500 });
		}

		// Get recent processing metrics
		const { data: recentMetrics } = await supabase
			.from('metrics')
			.select('*')
			.eq('metric_type', 'auction_processing')
			.order('recorded_at', { ascending: false })
			.limit(5);

		return json({
			expired_auctions_pending: expiredCount || 0,
			recent_processing: recentMetrics || [],
			last_checked: new Date().toISOString()
		});

	} catch (error) {
		console.error('Error checking auction processing status:', error);
		return json(
			{ error: 'Failed to check auction processing status' },
			{ status: 500 }
		);
	}
};
