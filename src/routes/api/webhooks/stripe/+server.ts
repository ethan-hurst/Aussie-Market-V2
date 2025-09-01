import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { supabase } from '$lib/supabase';
import { env } from '$lib/env';
import type { RequestHandler } from './$types';

const stripe = new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key_here', {
	apiVersion: '2023-10-16'
});

const endpointSecret = env.STRIPE_WEBHOOK_SECRET || 'whsec_your_webhook_secret_here';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	const sig = request.headers.get('stripe-signature');

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(body, sig!, endpointSecret);
	} catch (err) {
		console.error('Webhook signature verification failed:', err);
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	try {
		switch (event.type) {
			case 'payment_intent.succeeded':
				await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
				break;
			case 'payment_intent.payment_failed':
				await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
				break;
			case 'charge.dispute.created':
				await handleDisputeCreated(event.data.object as Stripe.Dispute);
				break;
			default:
				console.log(`Unhandled event type: ${event.type}`);
		}

		return json({ received: true });
	} catch (error) {
		console.error('Error processing webhook:', error);
		return json({ error: 'Webhook processing failed' }, { status: 500 });
	}
};

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
	const orderId = paymentIntent.metadata.order_id;
	
	if (!orderId) {
		console.error('No order_id in payment intent metadata');
		return;
	}

	// Update order state to paid
	const { error } = await supabase
		.from('orders')
		.update({
			state: 'paid',
			stripe_payment_intent_id: paymentIntent.id,
			paid_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', orderId);

	if (error) {
		console.error('Error updating order after payment success:', error);
		throw error;
	}

	// Create payment record
	await supabase
		.from('payments')
		.insert({
			order_id: orderId,
			amount_cents: paymentIntent.amount,
			currency: paymentIntent.currency,
			payment_method: 'stripe',
			stripe_payment_intent_id: paymentIntent.id,
			status: 'completed',
			processed_at: new Date().toISOString()
		});

	console.log(`Payment succeeded for order ${orderId}`);
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
	const orderId = paymentIntent.metadata.order_id;
	
	if (!orderId) {
		console.error('No order_id in payment intent metadata');
		return;
	}

	// Update order state to payment_failed
	const { error } = await supabase
		.from('orders')
		.update({
			state: 'payment_failed',
			updated_at: new Date().toISOString()
		})
		.eq('id', orderId);

	if (error) {
		console.error('Error updating order after payment failure:', error);
		throw error;
	}

	console.log(`Payment failed for order ${orderId}`);
}

async function handleDisputeCreated(dispute: Stripe.Dispute) {
	const paymentIntentId = dispute.payment_intent as string;
	
	if (!paymentIntentId) {
		console.error('No payment_intent in dispute');
		return;
	}

	// Find order by payment intent ID
	const { data: order, error: orderError } = await supabase
		.from('orders')
		.select('id')
		.eq('stripe_payment_intent_id', paymentIntentId)
		.single();

	if (orderError || !order) {
		console.error('Order not found for dispute:', paymentIntentId);
		return;
	}

	// Create dispute record
	await supabase
		.from('disputes')
		.insert({
			order_id: order.id,
			stripe_dispute_id: dispute.id,
			amount_cents: dispute.amount,
			currency: dispute.currency,
			reason: dispute.reason,
			status: 'open',
			created_at: new Date().toISOString()
		});

	// Update order state to disputed
	await supabase
		.from('orders')
		.update({
			state: 'disputed',
			updated_at: new Date().toISOString()
		})
		.eq('id', order.id);

	console.log(`Dispute created for order ${order.id}`);
}
