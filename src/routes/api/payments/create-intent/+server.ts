import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { mapApiErrorToMessage } from '$lib/errors';
import { supabase } from '$lib/supabase';
import { env } from '$lib/env';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/security';
import { validate, PaymentCreateIntentSchema } from '$lib/validation';

const stripe = new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key_here', {
	apiVersion: '2023-10-16'
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { data: { session } } = await locals.getSession();
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Rate limit payment intent creation per user (e.g., 10 per 10 minutes)
		const rl = rateLimit(`pay-create:${session.user.id}`, 10, 10 * 60_000);
		if (!rl.allowed) {
			return json({ error: 'Too many requests. Please slow down.' }, { status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} });
		}


		const parsed = validate(PaymentCreateIntentSchema, await request.json());
		if (!parsed.ok) return json({ error: mapApiErrorToMessage(parsed.error) }, { status: 400 });
		const { orderId, amount, currency } = parsed.value as any;

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

		// Check if order is in unpaid state (support both legacy 'pending' and 'pending_payment')
		const isUnpaid = order.state === 'pending' || order.state === 'pending_payment';
		if (!isUnpaid) {
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
		const friendly = mapApiErrorToMessage(error);
		if (error instanceof Stripe.errors.StripeError) {
			return json({ error: friendly }, { status: 400 });
		}
		return json({ error: friendly }, { status: 500 });
	}
};
