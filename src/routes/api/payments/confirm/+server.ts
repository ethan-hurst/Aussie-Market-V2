import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';
import { confirmPayment } from '$lib/orders';

export async function POST({ request }) {
	try {
		const { orderId, paymentIntentId } = await request.json();

		// Validate input
		if (!orderId || !paymentIntentId) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Confirm payment in database
		const success = await confirmPayment(orderId, paymentIntentId);

		if (!success) {
			return json({ error: 'Failed to confirm payment' }, { status: 500 });
		}

		return json({ success: true });

	} catch (error) {
		console.error('Error confirming payment:', error);
		return json({ error: 'Failed to confirm payment' }, { status: 500 });
	}
}
