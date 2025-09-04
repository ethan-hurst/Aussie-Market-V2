import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

export const GET: RequestHandler = async () => {
	try {
		// Test the end_expired_auctions function directly
		const { data: result, error } = await supabase
			.rpc('end_expired_auctions');

		if (error) {
			return json({
				success: false,
				error: error.message,
				message: 'Function call failed'
			}, { status: 500 });
		}

		return json({
			success: true,
			result: result,
			message: 'Function executed successfully'
		});

	} catch (error) {
		console.error('Cron test failed:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			message: 'Failed to test cron function'
		}, { status: 500 });
	}
};
