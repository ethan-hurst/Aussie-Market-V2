import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: '2024-12-18.acacia'
});

export async function POST({ request }) {
	try {
		const { orderId, amount, currency = 'aud' } = await request.json();

		// Validate input
		if (!orderId || !amount) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Get order details from database
		const { data: order, error: orderError } = await supabase
			.from('orders')
			.select(`
				*,
				listings (
					title,
					description
				)
			`)
			.eq('id', orderId)
			.single();

		if (orderError || !order) {
			return json({ error: 'Order not found' }, { status: 404 });
		}

		// Check if order is already paid
		if (order.state !== 'pending') {
			return json({ error: 'Order is not in pending state' }, { status: 400 });
		}

		// Create payment intent with Stripe
		const paymentIntent = await stripe.paymentIntents.create({
			amount: amount, // Amount in cents
			currency: currency,
			metadata: {
				orderId: orderId,
				listingTitle: order.listings.title
			},
			description: `Payment for ${order.listings.title}`,
			automatic_payment_methods: {
				enabled: true,
			},
		});

		return json({
			clientSecret: paymentIntent.client_secret,
			paymentIntentId: paymentIntent.id
		});

	} catch (error) {
		console.error('Error creating payment intent:', error);
		return json({ error: 'Failed to create payment intent' }, { status: 500 });
	}
}
