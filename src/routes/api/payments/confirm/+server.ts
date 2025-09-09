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
	const startTime = Date.now();
	
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserFromLocals(locals);

		// Rate limit payment confirmations per user
		const rl = rateLimit(`pay-confirm:${user.id}`, 20, 10 * 60_000);
		if (!rl.allowed) {
			console.warn(`Payment confirm rate limit exceeded for user ${user.id}`, {
				userId: user.id, retryAfter: rl.retryAfterMs
			});
			return json({ error: 'Too many requests. Please slow down.' }, { status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} });
		}

		const parsed = validate(PaymentConfirmSchema, await request.json());
		if (!parsed.ok) {
			console.warn('Invalid payment confirm request data', { 
				userId: user.id, validationError: parsed.error 
			});
			return json({ error: mapApiErrorToMessage(parsed.error) }, { status: 400 });
		}
		const { orderId, paymentIntentId } = parsed.value as any;

		console.info(`Payment confirmation initiated`, {
			orderId, paymentIntentId, userId: user.id,
			timestamp: new Date().toISOString()
		});

		// Fetch order details with enhanced error handling
		const orderFetchStart = Date.now();
		const { data: order, error: orderError } = await supabase
			.from('orders')
			.select('*')
			.eq('id', orderId)
			.single();

		const orderFetchTime = Date.now() - orderFetchStart;

		if (orderError) {
			console.error(`Database error fetching order ${orderId} for payment confirmation:`, {
				error: orderError.message, orderId, userId: user.id,
				paymentIntentId, orderFetchTimeMs: orderFetchTime
			});
			return ApiErrorHandler.handleDatabaseError(
				orderError,
				{ request, locals, params: { orderId }, url },
				{ operation: 'fetch_order_for_payment', userId: user.id }
			);
		}

		if (!order) {
			console.warn(`Order ${orderId} not found for payment confirmation`, {
				orderId, userId: user.id, paymentIntentId
			});
			return json({ error: 'Order not found' }, { status: 404 });
		}

		// Verify user is the buyer
		if (order.buyer_id !== user.id) {
			console.warn(`Unauthorized payment confirmation attempt`, {
				orderId, userId: user.id, buyerId: order.buyer_id,
				paymentIntentId, orderState: order.state
			});
			return json({ error: 'Unauthorized: Only the buyer can confirm payment' }, { status: 403 });
		}

		// Verify payment intent with Stripe with enhanced error handling
		const stripeRetrieveStart = Date.now();
		let paymentIntent;
		try {
			paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
		} catch (stripeError) {
			console.error(`Failed to retrieve Stripe payment intent ${paymentIntentId}:`, {
				error: stripeError instanceof Error ? stripeError.message : stripeError,
				orderId, userId: user.id, paymentIntentId
			});
			return ApiErrorHandler.handleStripeError(
				stripeError as Error,
				{ request, locals, params: { orderId }, url },
				{ operation: 'retrieve_payment_intent', userId: user.id }
			);
		}
		
		const stripeRetrieveTime = Date.now() - stripeRetrieveStart;
		
		if (paymentIntent.status !== 'succeeded') {
			console.warn(`Payment intent ${paymentIntentId} not in succeeded status:`, {
				paymentIntentId, status: paymentIntent.status,
				orderId, userId: user.id
			});
			return json({ 
				error: `Payment not completed - status: ${paymentIntent.status}`,
				paymentStatus: paymentIntent.status 
			}, { status: 400 });
		}

		// Additional security validations with detailed logging
		if (paymentIntent.metadata?.order_id !== orderId) {
			console.error(`Payment intent metadata mismatch:`, {
				paymentIntentId, expectedOrderId: orderId,
				actualOrderId: paymentIntent.metadata?.order_id,
				userId: user.id
			});
			return json({ error: 'Payment intent does not match order' }, { status: 400 });
		}

		if (paymentIntent.amount !== order.amount_cents) {
			console.error(`Payment amount mismatch:`, {
				paymentIntentId, orderId, expectedAmount: order.amount_cents,
				actualAmount: paymentIntent.amount, userId: user.id
			});
			return json({ error: 'Payment amount does not match order' }, { status: 400 });
		}

		console.info(`Payment intent validation successful:`, {
			paymentIntentId, orderId, userId: user.id,
			amount: paymentIntent.amount, status: paymentIntent.status,
			stripeRetrieveTimeMs: stripeRetrieveTime,
			orderFetchTimeMs: orderFetchTime
		});

		// Use database transaction for atomic payment confirmation
		const transactionStart = Date.now();
		const { data: transactionResult, error: transactionError } = await supabase.rpc('confirm_payment_transaction', {
			order_id: orderId,
			payment_intent_id: paymentIntentId,
			amount_cents: order.amount_cents,
			user_id: user.id
		});

		const transactionTime = Date.now() - transactionStart;

		if (transactionError) {
			console.error('Database transaction error in payment confirmation:', {
				error: transactionError.message, orderId, paymentIntentId,
				userId: user.id, amount: order.amount_cents,
				transactionTimeMs: transactionTime
			});
			return ApiErrorHandler.handleDatabaseError(
				transactionError,
				{ request, locals, params: { orderId }, url },
				{ 
					operation: 'confirm_payment_transaction', 
					userId: user.id,
					query: 'confirm_payment_transaction RPC'
				}
			);
		}

		// If transaction failed, return error with detailed logging
		if (!transactionResult || !transactionResult.success) {
			console.error('Payment confirmation transaction failed:', {
				orderId, paymentIntentId, userId: user.id,
				transactionResult, transactionTimeMs: transactionTime
			});
			return json({ 
				error: transactionResult?.error || 'Payment confirmation failed',
				code: 'TRANSACTION_FAILED'
			}, { status: 400 });
		}

		// Send notifications with enhanced error handling
		const notificationStart = Date.now();
		try {
			await notifyOrderPaid(orderId, order.buyer_id, order.seller_id);
			console.info(`Payment notifications sent successfully:`, {
				orderId, buyerId: order.buyer_id, sellerId: order.seller_id,
				notificationTimeMs: Date.now() - notificationStart
			});
		} catch (notificationError) {
			console.error('Failed to send payment notifications:', {
				error: notificationError instanceof Error ? notificationError.message : notificationError,
				orderId, buyerId: order.buyer_id, sellerId: order.seller_id,
				notificationTimeMs: Date.now() - notificationStart
			});
			// Don't fail the payment confirmation for notification errors
		}

		const totalProcessingTime = Date.now() - startTime;

		// Log successful payment for audit trail with comprehensive details
		console.info(`Payment confirmed successfully:`, {
			orderId, paymentIntentId, userId: user.id,
			amount: order.amount_cents, orderState: 'paid',
			processingTimeMs: totalProcessingTime,
			breakdown: {
				orderFetchTimeMs: orderFetchTime,
				stripeRetrieveTimeMs: stripeRetrieveTime,
				transactionTimeMs: transactionTime
			}
		});

		return json({ 
			success: true, 
			message: 'Payment confirmed successfully',
			orderState: 'paid',
			paymentIntentId: paymentIntentId,
			amount: order.amount_cents,
			timestamp: new Date().toISOString(),
			processingTimeMs: totalProcessingTime
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
