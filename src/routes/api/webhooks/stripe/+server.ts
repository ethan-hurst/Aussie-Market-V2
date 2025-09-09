import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { supabase } from '$lib/supabase';
import { env } from '$lib/env';
import type { RequestHandler } from './$types';

// Production security: Only use real secrets in production
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
const isE2EMode = process.env.E2E_TESTING === 'true' || process.env.NODE_ENV === 'test';

// Validate production secrets
if (isProduction) {
	if (!env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.includes('test') || env.STRIPE_SECRET_KEY.includes('your_stripe_secret_key_here')) {
		throw new Error('Production requires real Stripe secret key');
	}
	if (!env.STRIPE_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET.includes('your_webhook_secret_here')) {
		throw new Error('Production requires real Stripe webhook secret');
	}
}

const stripe = new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key_here', {
	apiVersion: '2023-10-16'
});

const endpointSecret = env.STRIPE_WEBHOOK_SECRET || 'whsec_your_webhook_secret_here';
const WEBHOOK_TOLERANCE_SECONDS = 300; // 5 minutes
const MAX_EVENT_AGE_SECONDS = 3600; // 1 hour - reject very old events

/**
 * Extract order ID from Stripe event based on event type
 */
function getOrderIdFromEvent(event: Stripe.Event): string | null {
	try {
		switch (event.type) {
			case 'payment_intent.succeeded':
			case 'payment_intent.payment_failed':
			case 'payment_intent.canceled':
			case 'payment_intent.amount_capturable_updated':
				return (event.data.object as Stripe.PaymentIntent).metadata?.order_id || null;
			
			case 'charge.dispute.created':
			case 'charge.dispute.closed':
			case 'charge.dispute.updated':
				// For disputes, we'll need to look up the order via charge ID
				return null; // Will be resolved in handler
			
			case 'charge.refund.updated':
			case 'charge.refunded':
				// For refunds, we'll need to look up the order via payment intent
				return null; // Will be resolved in handler
			
			default:
				return null;
		}
	} catch (error) {
		console.error('Error extracting order ID from event:', error);
		return null;
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	const sig = request.headers.get('stripe-signature');

	// Enhanced security: Reject requests without signature in production and E2E tests
	if ((isProduction || isE2EMode) && !sig) {
		console.error('Webhook request missing signature');
		return json({ error: 'Missing signature' }, { status: 400 });
	}

	let event: Stripe.Event;

	try {
		// Enhanced signature validation
		if (sig === 'sig_mock' && (isDevelopment || isE2EMode)) {
			// Only allow mock signatures in development and E2E tests
			event = JSON.parse(body) as any;
		} else if (sig && endpointSecret) {
			// Production: Always validate real signatures
			event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
		} else {
			throw new Error('Invalid signature configuration');
		}
	} catch (err) {
		console.error('Webhook signature verification failed:', err);
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	// Enhanced event age validation
	try {
		if (event?.created) {
			const nowSec = Math.floor(Date.now() / 1000);
			const eventAge = nowSec - event.created;
			
			// Reject events that are too old (potential replay attacks)
			if (eventAge > MAX_EVENT_AGE_SECONDS) {
				console.error(`Rejecting old event: ${event.id}, age: ${eventAge}s`);
				return json({ error: 'Event too old' }, { status: 400 });
			}
			
			// Reject events from the future (clock skew protection)
			if (eventAge < -WEBHOOK_TOLERANCE_SECONDS) {
				console.error(`Rejecting future event: ${event.id}, age: ${eventAge}s`);
				return json({ error: 'Event from future' }, { status: 400 });
			}
		}
	} catch (e) {
		console.error('Event age validation failed:', e);
		return json({ error: 'Invalid event timestamp' }, { status: 400 });
	}

	// Enhanced idempotency: Check by (event_id, order_id, event_type)
	try {
		if (event?.id) {
			// First check: Global event idempotency
			const existing = await supabase
				.from('webhook_events')
				.select('event_id, processed_at, order_id, event_type')
				.eq('event_id', event.id)
				.single();
			
			if (existing.data) {
				console.log(`Event ${event.id} already processed`);
				return json({ received: true, idempotent: true });
			}

			// Second check: Order-specific idempotency for payment events
			const orderId = getOrderIdFromEvent(event);
			if (orderId) {
				const orderEvent = await supabase
					.from('webhook_events')
					.select('event_id, processed_at')
					.eq('order_id', orderId)
					.eq('event_type', event.type)
					.eq('processed_at', null)
					.single();
				
				if (orderEvent.data) {
					console.log(`Order ${orderId} already has pending ${event.type} event`);
					return json({ received: true, idempotent: true });
				}
			}

			// Record the event
			await supabase
				.from('webhook_events')
				.insert({
					event_id: event.id,
					type: event.type,
					order_id: orderId,
					event_type: event.type,
					created_at: event.created ? new Date(event.created * 1000).toISOString() : new Date().toISOString()
				});
		}
	} catch (e) {
		console.error('Idempotency check failed:', e);
		// In production, fail fast on idempotency errors
		if (isProduction) {
			return json({ error: 'Idempotency check failed' }, { status: 500 });
		}
	}

	try {
		// Enhanced event processing with comprehensive error handling
		console.log(`Processing webhook event: ${event.type} (${event.id})`);
		
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
				console.log(`Unhandled event type: ${event.type} (${event.id})`);
				// Don't fail for unhandled events - just log and continue
		}

		// Mark event processed for idempotency
		try {
			if (event?.id) {
				await supabase
					.from('webhook_events')
					.update({ 
						processed_at: new Date().toISOString()
					})
					.eq('event_id', event.id);
			}
		} catch (markError) {
			console.error('Error marking event as processed:', markError);
			// Don't fail the webhook for this
		}

		console.log(`Successfully processed webhook event: ${event.type} (${event.id})`);
		return json({ received: true, processed: true });
	} catch (error) {
		console.error(`Error processing webhook event ${event.type} (${event.id}):`, error);
		
		// Mark event as failed for monitoring
		try {
			if (event?.id) {
				await supabase
					.from('webhook_events')
					.update({ 
						processed_at: new Date().toISOString(),
						error_message: error instanceof Error ? error.message : 'Unknown error'
					})
					.eq('event_id', event.id);
			}
		} catch (markError) {
			console.error('Error marking event as failed:', markError);
		}

		// Return appropriate error response
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		let statusCode = 500; // Default to server error
		
		// Determine appropriate status code based on error type
		if (errorMessage.includes('signature') || errorMessage.includes('Invalid')) {
			statusCode = 400; // Bad request
		} else if (errorMessage.includes('too old') || errorMessage.includes('future')) {
			statusCode = 400; // Bad request
		} else if (errorMessage.includes('state') || errorMessage.includes('transition')) {
			statusCode = 422; // Unprocessable entity
		}
		
		return json({ 
			error: 'Webhook processing failed', 
			details: isDevelopment ? errorMessage : undefined,
			event_id: event.id,
			event_type: event.type
		}, { status: statusCode });
	}
};

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
	const orderId = paymentIntent.metadata.order_id;
	
	if (!orderId) {
		console.error('No order_id in payment intent metadata');
		throw new Error('Missing order_id in payment intent metadata');
	}

	// Enhanced state validation: Only allow transitions from pending states
	const { data: existingOrder, error: fetchError } = await supabase
		.from('orders')
		.select('state, stripe_payment_intent_id')
		.eq('id', orderId)
		.single();

	if (fetchError) {
		console.error('Error fetching order for payment success:', fetchError);
		console.log(`Order ${orderId} not found - treating as idempotent success`);
		return; // Idempotent: order doesn't exist, treat as success
	}

	if (!existingOrder) {
		console.log(`Order ${orderId} not found - treating as idempotent success`);
		return; // Idempotent: order doesn't exist, treat as success
	}

	// Prevent state downgrades and duplicate processing
	const validFromStates = ['pending', 'pending_payment'];
	if (!validFromStates.includes(existingOrder.state)) {
		console.log(`Order ${orderId} in state ${existingOrder.state}, cannot transition to paid`);
		return; // Idempotent: already processed
	}

	// Prevent duplicate payment intent processing
	if (existingOrder.stripe_payment_intent_id && existingOrder.stripe_payment_intent_id !== paymentIntent.id) {
		console.error(`Order ${orderId} already has different payment intent: ${existingOrder.stripe_payment_intent_id}`);
		throw new Error('Order already has different payment intent');
	}

	// Atomic update with state validation
	const { error: updateError } = await supabase
		.from('orders')
		.update({
			state: 'paid',
			stripe_payment_intent_id: paymentIntent.id,
			paid_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', orderId)
		.in('state', validFromStates); // Only update if still in valid state

	if (updateError) {
		console.error('Error updating order after payment success:', updateError);
		// Check if it's a state transition error (order state changed)
		if (updateError.message.includes('state') || updateError.message.includes('transition')) {
			console.log(`Order ${orderId} state changed during processing - treating as idempotent success`);
			return; // Idempotent: order state changed, treat as success
		}
		// For other database errors, log and continue (don't fail webhook)
		console.error(`Database error updating order ${orderId}, but continuing webhook processing`);
	}

	// Create payment record with idempotency
	const { error: paymentError } = await supabase
		.from('payments')
		.upsert({
			order_id: orderId,
			amount_cents: paymentIntent.amount,
			currency: paymentIntent.currency,
			payment_method: 'stripe',
			stripe_payment_intent_id: paymentIntent.id,
			status: 'completed',
			processed_at: new Date().toISOString()
		}, {
			onConflict: 'order_id,stripe_payment_intent_id'
		});

	if (paymentError) {
		console.error('Error creating payment record:', paymentError);
		// Don't throw here - order is already updated
	}

	console.log(`Payment succeeded for order ${orderId}`);
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
	const orderId = paymentIntent.metadata.order_id;

	if (!orderId) {
		console.error('No order_id in failed payment intent metadata');
		throw new Error('Missing order_id in payment intent metadata');
	}

	// Enhanced state validation: Only allow transitions from pending states
	const { data: existingOrder, error: fetchError } = await supabase
		.from('orders')
		.select('state, stripe_payment_intent_id')
		.eq('id', orderId)
		.single();

	if (fetchError) {
		console.error('Error fetching order for payment failure:', fetchError);
		console.log(`Order ${orderId} not found - treating as idempotent success`);
		return; // Idempotent: order doesn't exist, treat as success
	}

	if (!existingOrder) {
		console.log(`Order ${orderId} not found - treating as idempotent success`);
		return; // Idempotent: order doesn't exist, treat as success
	}

	// Prevent state downgrades - only allow from pending states
	const validFromStates = ['pending', 'pending_payment'];
	if (!validFromStates.includes(existingOrder.state)) {
		console.log(`Order ${orderId} in state ${existingOrder.state}, cannot transition to payment_failed`);
		return; // Idempotent: already processed
	}

	// Prevent duplicate payment intent processing
	if (existingOrder.stripe_payment_intent_id && existingOrder.stripe_payment_intent_id !== paymentIntent.id) {
		console.error(`Order ${orderId} already has different payment intent: ${existingOrder.stripe_payment_intent_id}`);
		throw new Error('Order already has different payment intent');
	}

	// Atomic update with state validation
	const { error: updateError } = await supabase
		.from('orders')
		.update({
			state: 'payment_failed',
			stripe_payment_intent_id: paymentIntent.id,
			updated_at: new Date().toISOString()
		})
		.eq('id', orderId)
		.in('state', validFromStates); // Only update if still in valid state

	if (updateError) {
		console.error('Error updating order after payment failure:', updateError);
		throw new Error(`Failed to update order ${orderId}: ${updateError.message}`);
	}

	// Create payment record with idempotency
	const { error: paymentError } = await supabase
		.from('payments')
		.upsert({
			order_id: orderId,
			amount_cents: paymentIntent.amount,
			currency: paymentIntent.currency,
			payment_method: 'stripe',
			stripe_payment_intent_id: paymentIntent.id,
			status: 'failed',
			error_message: paymentIntent.last_payment_error?.message || 'Payment failed',
			processed_at: new Date().toISOString()
		}, {
			onConflict: 'order_id,stripe_payment_intent_id'
		});

	if (paymentError) {
		console.error('Error creating payment record:', paymentError);
		// Don't throw here - order is already updated
	}

	// Send failure notification (idempotent)
	try {
		const { data: order } = await supabase
			.from('orders')
			.select('buyer_id')
			.eq('id', orderId)
			.single();

		if (order) {
			await supabase
				.from('notifications')
				.upsert({
					user_id: order.buyer_id,
					type: 'payment_failed',
					title: 'Payment Failed',
					message: `Your payment for order ${orderId} could not be processed. Please try again.`,
					metadata: { order_id: orderId, payment_intent_id: paymentIntent.id }
				}, {
					onConflict: 'user_id,type,metadata'
				});
		}
	} catch (notificationError) {
		console.error('Error sending payment failure notification:', notificationError);
		// Don't throw - notification failure shouldn't fail the webhook
	}

	console.log(`Payment failed for order ${orderId}: ${paymentIntent.last_payment_error?.message}`);
}

async function handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent) {
	const orderId = paymentIntent.metadata.order_id;

	if (!orderId) {
		console.error('No order_id in canceled payment intent metadata');
		throw new Error('Missing order_id in payment intent metadata');
	}

	// Enhanced state validation: Only allow transitions from pending states
	const { data: existingOrder, error: fetchError } = await supabase
		.from('orders')
		.select('state, stripe_payment_intent_id')
		.eq('id', orderId)
		.single();

	if (fetchError) {
		console.error('Error fetching order for payment cancellation:', fetchError);
		console.log(`Order ${orderId} not found - treating as idempotent success`);
		return; // Idempotent: order doesn't exist, treat as success
	}

	if (!existingOrder) {
		console.log(`Order ${orderId} not found - treating as idempotent success`);
		return; // Idempotent: order doesn't exist, treat as success
	}

	// Prevent state downgrades - only allow from pending states
	const validFromStates = ['pending', 'pending_payment'];
	if (!validFromStates.includes(existingOrder.state)) {
		console.log(`Order ${orderId} in state ${existingOrder.state}, cannot transition to cancelled`);
		return; // Idempotent: already processed
	}

	// Prevent duplicate payment intent processing
	if (existingOrder.stripe_payment_intent_id && existingOrder.stripe_payment_intent_id !== paymentIntent.id) {
		console.error(`Order ${orderId} already has different payment intent: ${existingOrder.stripe_payment_intent_id}`);
		throw new Error('Order already has different payment intent');
	}

	// Atomic update with state validation
	const { error: updateError } = await supabase
		.from('orders')
		.update({
			state: 'cancelled',
			stripe_payment_intent_id: paymentIntent.id,
			updated_at: new Date().toISOString()
		})
		.eq('id', orderId)
		.in('state', validFromStates); // Only update if still in valid state

	if (updateError) {
		console.error('Error updating order after payment cancellation:', updateError);
		throw new Error(`Failed to update order ${orderId}: ${updateError.message}`);
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

	// Update order state unless already in a terminal/advanced state
	const { data: orderStateRow } = await supabase
		.from('orders')
		.select('state')
		.eq('id', payment.order_id)
		.single();

	if (orderStateRow && ['refunded', 'released'].includes(orderStateRow.state)) {
		console.log(`Order ${payment.order_id} already in state ${orderStateRow.state}; not setting disputed.`);
		return;
	}

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
	const newOrderState = dispute.status === 'won' ? 'released' : 'refunded';

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

	// Update order state unless already refunded
	const { data: orderRow } = await supabase
		.from('orders')
		.select('state')
		.eq('id', payment.order_id)
		.single();
	if (orderRow && orderRow.state === 'refunded') {
		console.log(`Order ${payment.order_id} already refunded; skipping.`);
		return;
	}

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
