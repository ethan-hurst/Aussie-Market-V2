import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { data: { session } } = await locals.getSession();
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { orderId } = params;
		if (!orderId) {
			return json({ error: 'Order ID required' }, { status: 400 });
		}

		// Fetch order with all related data
		const { data: order, error } = await supabase
			.from('orders')
			.select(`
				*,
				listing:listings(
					id,
					title,
					description,
					starting_price_cents,
					reserve_price_cents,
					end_time,
					status,
					listing_photos(url, order_idx)
				),
				buyer:users!orders_buyer_id_fkey(
					id,
					legal_name,
					email,
					phone
				),
				seller:users!orders_seller_id_fkey(
					id,
					legal_name,
					email,
					phone
				),
				winning_bid:bids!orders_winning_bid_id_fkey(
					id,
					amount_cents,
					created_at
				)
			`)
			.eq('id', orderId)
			.single();

		if (error) {
			console.error('Error fetching order:', error);
			return json({ error: 'Failed to fetch order' }, { status: 500 });
		}

		if (!order) {
			return json({ error: 'Order not found' }, { status: 404 });
		}

		// Check if user is authorized to view this order
		if (order.buyer_id !== session.user.id && order.seller_id !== session.user.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		return json(order);
	} catch (error) {
		console.error('Error in order API:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
