import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { supabase } from '$lib/supabase';
import { notifyOrderPaid } from '$lib/notifications';
import type { RequestHandler } from './$types';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key_here', {
	apiVersion: '2023-10-16'
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { data: { session } } = await locals.getSession();
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { orderId, paymentIntentId } = await request.json();

		if (!orderId || !paymentIntentId) {
			return json({ error: 'Order ID and payment intent ID required' }, { status: 400 });
		}

		// Fetch order details
		const { data: order, error: orderError } = await supabase
			.from('orders')
			.select('*')
			.eq('id', orderId)
			.single();

		if (orderError || !order) {
			return json({ error: 'Order not found' }, { status: 404 });
		}

		// Verify user is the buyer
		if (order.buyer_id !== session.user.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		// Verify payment intent with Stripe
		const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
		
		if (paymentIntent.status !== 'succeeded') {
			return json({ error: 'Payment not completed' }, { status: 400 });
		}

		// Update order state to paid
		const { error: updateError } = await supabase
			.from('orders')
			.update({
				state: 'paid',
				stripe_payment_intent_id: paymentIntentId,
				paid_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', orderId);

		if (updateError) {
			console.error('Error updating order:', updateError);
			return json({ error: 'Failed to update order' }, { status: 500 });
		}

		// Create payment record
		const { error: paymentError } = await supabase
			.from('payments')
			.insert({
				order_id: orderId,
				amount_cents: order.total_amount_cents,
				currency: 'aud',
				payment_method: 'stripe',
				stripe_payment_intent_id: paymentIntentId,
				status: 'completed',
				processed_at: new Date().toISOString()
			});

		if (paymentError) {
			console.error('Error creating payment record:', paymentError);
			// Don't fail the whole request if payment record creation fails
		}

		// Create ledger entry for the payment
		const { error: ledgerError } = await supabase
			.from('ledger_entries')
			.insert({
				order_id: orderId,
				user_id: session.user.id,
				amount_cents: order.total_amount_cents,
				entry_type: 'payment_received',
				description: `Payment received for order ${orderId}`,
				created_at: new Date().toISOString()
			});

		if (ledgerError) {
			console.error('Error creating ledger entry:', ledgerError);
			// Don't fail the whole request if ledger entry creation fails
		}

		// Send notifications
		await notifyOrderPaid(orderId, order.buyer_id, order.seller_id);

		return json({ 
			success: true, 
			message: 'Payment confirmed successfully',
			orderState: 'paid'
		});
	} catch (error) {
		console.error('Error confirming payment:', error);
		
		if (error instanceof Stripe.errors.StripeError) {
			return json({ error: error.message }, { status: 400 });
		}
		
		return json({ error: 'Failed to confirm payment' }, { status: 500 });
	}
};
