import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { supabase } from '$lib/supabase';
import { env } from '$lib/env';
import type { RequestHandler } from './$types';

const stripe = new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key_here', {
	apiVersion: '2023-10-16'
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { data: { session } } = await locals.getSession();
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { orderId, amount, currency = 'aud' } = await request.json();

		if (!orderId || !amount) {
			return json({ error: 'Order ID and amount required' }, { status: 400 });
		}

		// Fetch order details
		const { data: order, error: orderError } = await supabase
			.from('orders')
			.select(`
				*,
				buyer:users!orders_buyer_id_fkey(legal_name, email),
				listing:listings(title)
			`)
			.eq('id', orderId)
			.single();

		if (orderError || !order) {
			return json({ error: 'Order not found' }, { status: 404 });
		}

		// Verify user is the buyer
		if (order.buyer_id !== session.user.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		// Check if order is in pending state
		if (order.state !== 'pending') {
			return json({ error: 'Order cannot be paid for' }, { status: 400 });
		}

		// Create Stripe Payment Intent
		const paymentIntent = await stripe.paymentIntents.create({
			amount: amount,
			currency: currency,
			metadata: {
				order_id: orderId,
				buyer_id: session.user.id,
				listing_title: order.listing.title
			},
			description: `Payment for order ${orderId} - ${order.listing.title}`,
			receipt_email: order.buyer.email,
			automatic_payment_methods: {
				enabled: true
			}
		});

		// Update order with payment intent ID
		await supabase
			.from('orders')
			.update({ 
				stripe_payment_intent_id: paymentIntent.id,
				updated_at: new Date().toISOString()
			})
			.eq('id', orderId);

		return json({
			clientSecret: paymentIntent.client_secret,
			paymentIntentId: paymentIntent.id
		});
	} catch (error) {
		console.error('Error creating payment intent:', error);
		
		if (error instanceof Stripe.errors.StripeError) {
			return json({ error: error.message }, { status: 400 });
		}
		
		return json({ error: 'Failed to create payment intent' }, { status: 500 });
	}
};
