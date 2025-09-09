import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import Stripe from 'stripe';
import { supabase } from '$lib/supabase';
import { notifyOrderPaid } from '$lib/notifications';
import { env } from '$lib/env';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/security';
import { validate, PaymentConfirmSchema } from '$lib/validation';
import { getSessionUserFromLocals } from '$lib/session';
import { ApiErrorHandler } from '$lib/api-error-handler';

const stripe = new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key_here', {
	apiVersion: '2023-10-16'
});

export const POST: RequestHandler = async ({ request, locals, url }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserFromLocals(locals);

		// Rate limit payment confirmations per user
		const rl = rateLimit(`pay-confirm:${user.id}`, 20, 10 * 60_000);
		if (!rl.allowed) {
			return json({ error: 'Too many requests. Please slow down.' }, { status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} });
		}

		const parsed = validate(PaymentConfirmSchema, await request.json());
		if (!parsed.ok) return json({ error: mapApiErrorToMessage(parsed.error) }, { status: 400 });
		const { orderId, paymentIntentId } = parsed.value as any;

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
		if (order.buyer_id !== user.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		// Verify payment intent with Stripe
		const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
		
		if (paymentIntent.status !== 'succeeded') {
			console.log(`Payment intent ${paymentIntentId} has status: ${paymentIntent.status}`);
			return json({ 
				error: `Payment not completed - status: ${paymentIntent.status}`,
				paymentStatus: paymentIntent.status 
			}, { status: 400 });
		}

		// Additional security validations
		if (paymentIntent.metadata.order_id !== orderId) {
			return json({ error: 'Payment intent does not match order' }, { status: 400 });
		}

		if (paymentIntent.amount !== order.amount_cents) {
			return json({ error: 'Payment amount does not match order' }, { status: 400 });
		}

		// Use database transaction for atomic payment confirmation
		const { data: transactionResult, error: transactionError } = await supabase.rpc('confirm_payment_transaction', {
			order_id: orderId,
			payment_intent_id: paymentIntentId,
			amount_cents: order.amount_cents,
			user_id: user.id
		});

		if (transactionError) {
			console.error('Error in payment confirmation transaction:', transactionError);
			return json({ error: 'Failed to confirm payment' }, { status: 500 });
		}

		// If transaction failed, return error
		if (!transactionResult || !transactionResult.success) {
			return json({ 
				error: transactionResult?.error || 'Payment confirmation failed' 
			}, { status: 400 });
		}

		// Send notifications
		try {
			await notifyOrderPaid(orderId, order.buyer_id, order.seller_id);
		} catch (notificationError) {
			console.error('Failed to send payment notifications:', notificationError);
			// Don't fail the payment confirmation for notification errors
		}

		// Log successful payment for audit trail
		console.log(`Payment confirmed successfully: Order ${orderId}, Payment Intent ${paymentIntentId}, User ${user.id}, Amount ${order.amount_cents}`);

		return json({ 
			success: true, 
			message: 'Payment confirmed successfully',
			orderState: 'paid',
			paymentIntentId: paymentIntentId,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		// Handle authentication errors gracefully
		if (error instanceof Response) {
			return error;
		}

		// Handle Stripe errors specifically
		if (error instanceof Stripe.errors.StripeError) {
			return ApiErrorHandler.handleStripeError(error, { request, locals, url }, {
				operation: 'confirm_payment',
				userId: undefined,
				stripeError: {
					type: error.type,
					code: error.code,
					decline_code: error.decline_code
				}
			});
		}

		return ApiErrorHandler.handleError(error as Error, { request, locals, url }, {
			operation: 'confirm_payment',
			userId: undefined // User not available in catch scope
		});
	}
};
