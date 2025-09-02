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
			case 'payment_intent.canceled':
				await handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent);
				break;
			case 'payment_intent.amount_capturable_updated':
				await handlePaymentIntentAmountCapturableUpdated(event.data.object as Stripe.PaymentIntent);
				break;
			case 'charge.dispute.created':
				await handleDisputeCreated(event.data.object as Stripe.Dispute);
				break;
			case 'charge.dispute.closed':
				await handleDisputeClosed(event.data.object as Stripe.Dispute);
				break;
			case 'charge.dispute.updated':
				await handleDisputeUpdated(event.data.object as Stripe.Dispute);
				break;
			case 'charge.refund.updated':
				await handleRefundUpdated(event.data.object as Stripe.Refund);
				break;
			case 'charge.refunded':
				await handleChargeRefunded(event.data.object as Stripe.Charge);
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
		console.error('No order_id in failed payment intent metadata');
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

	// Update payment record
	await supabase
		.from('payments')
		.insert({
			order_id: orderId,
			amount_cents: paymentIntent.amount,
			currency: paymentIntent.currency,
			payment_method: 'stripe',
			stripe_payment_intent_id: paymentIntent.id,
			status: 'failed',
			error_message: paymentIntent.last_payment_error?.message || 'Payment failed',
			processed_at: new Date().toISOString()
		});

	// Send failure notification
	const { data: order } = await supabase
		.from('orders')
		.select('buyer_id')
		.eq('id', orderId)
		.single();

	if (order) {
		await supabase
			.from('notifications')
			.insert({
				user_id: order.buyer_id,
				type: 'payment_failed',
				title: 'Payment Failed',
				message: `Your payment for order ${orderId} could not be processed. Please try again.`,
				metadata: { order_id: orderId }
			});
	}

	console.log(`Payment failed for order ${orderId}: ${paymentIntent.last_payment_error?.message}`);
}

async function handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent) {
	const orderId = paymentIntent.metadata.order_id;

	if (!orderId) {
		console.error('No order_id in canceled payment intent metadata');
		return;
	}

	// Update order state to canceled
	const { error } = await supabase
		.from('orders')
		.update({
			state: 'canceled',
			updated_at: new Date().toISOString()
		})
		.eq('id', orderId);

	if (error) {
		console.error('Error updating order after payment cancellation:', error);
		throw error;
	}

	console.log(`Payment canceled for order ${orderId}`);
}

async function handlePaymentIntentAmountCapturableUpdated(paymentIntent: Stripe.PaymentIntent) {
	const orderId = paymentIntent.metadata.order_id;

	if (!orderId) {
		console.error('No order_id in payment intent amount capturable update');
		return;
	}

	// Update payment record with capturable amount
	await supabase
		.from('payments')
		.update({
			capturable_amount_cents: paymentIntent.amount_capturable,
			updated_at: new Date().toISOString()
		})
		.eq('stripe_payment_intent_id', paymentIntent.id);

	console.log(`Payment amount capturable updated for order ${orderId}: ${paymentIntent.amount_capturable}`);
}

async function handleDisputeCreated(dispute: Stripe.Dispute) {
	// Find order by charge ID
	const { data: payment } = await supabase
		.from('payments')
		.select('order_id')
		.eq('stripe_charge_id', dispute.charge)
		.single();

	if (!payment) {
		console.error('No payment found for disputed charge:', dispute.charge);
		return;
	}

	// Create dispute record
	await supabase
		.from('disputes')
		.insert({
			order_id: payment.order_id,
			dispute_reason: dispute.reason,
			dispute_status: dispute.status,
			disputed_amount_cents: dispute.amount,
			stripe_dispute_id: dispute.id,
			initiator: 'stripe',
			description: `Dispute created by Stripe: ${dispute.reason}`
		});

	// Update order state
	await supabase
		.from('orders')
		.update({
			state: 'disputed',
			updated_at: new Date().toISOString()
		})
		.eq('id', payment.order_id);

	// Send dispute notification
	const { data: order } = await supabase
		.from('orders')
		.select('buyer_id, seller_id')
		.eq('id', payment.order_id)
		.single();

	if (order) {
		// Notify seller (dispute usually affects seller)
		await supabase
			.from('notifications')
			.insert({
				user_id: order.seller_id,
				type: 'dispute_created',
				title: 'Payment Dispute Created',
				message: `A dispute has been created for order ${payment.order_id}. Reason: ${dispute.reason}`,
				metadata: { order_id: payment.order_id, dispute_id: dispute.id }
			});
	}

	console.log(`Dispute created for order ${payment.order_id}: ${dispute.reason}`);
}

async function handleDisputeClosed(dispute: Stripe.Dispute) {
	const { data: disputeRecord } = await supabase
		.from('disputes')
		.select('order_id')
		.eq('stripe_dispute_id', dispute.id)
		.single();

	if (!disputeRecord) {
		console.error('No dispute record found for:', dispute.id);
		return;
	}

	// Update dispute status
	await supabase
		.from('disputes')
		.update({
			dispute_status: dispute.status,
			resolution: dispute.status === 'won' ? 'seller_won' : 'buyer_won',
			resolved_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('stripe_dispute_id', dispute.id);

	// Update order state based on dispute outcome
	const newOrderState = dispute.status === 'won' ? 'completed' : 'refunded';

	await supabase
		.from('orders')
		.update({
			state: newOrderState,
			updated_at: new Date().toISOString()
		})
		.eq('id', disputeRecord.order_id);

	console.log(`Dispute closed for order ${disputeRecord.order_id}: ${dispute.status}`);
}

async function handleDisputeUpdated(dispute: Stripe.Dispute) {
	await supabase
		.from('disputes')
		.update({
			dispute_status: dispute.status,
			updated_at: new Date().toISOString()
		})
		.eq('stripe_dispute_id', dispute.id);

	console.log(`Dispute updated: ${dispute.id} - ${dispute.status}`);
}

async function handleRefundUpdated(refund: Stripe.Refund) {
	const { data: payment } = await supabase
		.from('payments')
		.select('order_id')
		.eq('stripe_payment_intent_id', refund.payment_intent as string)
		.single();

	if (!payment) {
		console.error('No payment found for refunded payment intent:', refund.payment_intent);
		return;
	}

	// Create refund record
	await supabase
		.from('payments')
		.insert({
			order_id: payment.order_id,
			amount_cents: refund.amount,
			currency: refund.currency,
			payment_method: 'stripe_refund',
			stripe_refund_id: refund.id,
			status: 'completed',
			processed_at: new Date().toISOString()
		});

	// Update order state
	await supabase
		.from('orders')
		.update({
			state: 'refunded',
			refunded_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', payment.order_id);

	// Send refund notification
	const { data: order } = await supabase
		.from('orders')
		.select('buyer_id, seller_id')
		.eq('id', payment.order_id)
		.single();

	if (order) {
		await supabase
			.from('notifications')
			.insert({
				user_id: order.buyer_id,
				type: 'refund_processed',
				title: 'Refund Processed',
				message: `Your refund for order ${payment.order_id} has been processed.`,
				metadata: { order_id: payment.order_id, refund_id: refund.id }
			});
	}

	console.log(`Refund processed for order ${payment.order_id}: ${refund.amount}`);
}

async function handleChargeRefunded(charge: Stripe.Charge) {
	const { data: payment } = await supabase
		.from('payments')
		.select('order_id')
		.eq('stripe_charge_id', charge.id)
		.single();

	if (!payment) {
		console.error('No payment found for refunded charge:', charge.id);
		return;
	}

	// Update order state
	await supabase
		.from('orders')
		.update({
			state: 'refunded',
			refunded_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', payment.order_id);

	console.log(`Charge fully refunded for order ${payment.order_id}`);
}

// Removed duplicate function declarations for handlePaymentIntentFailed and handleDisputeCreated
