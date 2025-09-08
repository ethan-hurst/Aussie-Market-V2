import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import Stripe from 'stripe';
import { supabase } from '$lib/supabase';
import { notifyOrderPaid } from '$lib/notifications';
import { env } from '$lib/env';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/security';
import { validate, PaymentConfirmSchema } from '$lib/validation';
import { getSessionUserOrThrow } from '$lib/session';

const stripe = new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key_here', {
	apiVersion: '2023-10-16'
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserOrThrow({ request, locals } as any);

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
			return json({ error: 'Payment not completed' }, { status: 400 });
		}

		// Update order state to paid (idempotent safe)
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
				amount_cents: order.amount_cents,
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
				user_id: user.id,
				amount_cents: order.amount_cents,
				entry_type: 'CAPTURE',
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
		const friendly = mapApiErrorToMessage(error);
		if (error instanceof Stripe.errors.StripeError) {
			return json({ error: friendly }, { status: 400 });
		}
		return json({ error: friendly }, { status: 500 });
	}
};
