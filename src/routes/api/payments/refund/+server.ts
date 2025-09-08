import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
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

    const { orderId, amount_cents } = await request.json();
    if (!orderId) {
      return json({ error: 'Order ID required' }, { status: 400 });
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

    // Only seller (or future admin) can initiate refund
    if (order.seller_id !== session.user.id) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    // Must have a Stripe payment intent present and order must be refundable
    if (!order.stripe_payment_intent_id) {
      return json({ error: 'No payment intent associated with this order' }, { status: 400 });
    }

    const refundAmount = typeof amount_cents === 'number' && amount_cents > 0
      ? amount_cents
      : order.amount_cents;

    // Create Stripe refund
    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      amount: refundAmount
    });

    // Use database transaction for atomic refund processing
    const { data: transactionResult, error: transactionError } = await supabase.rpc('process_refund_transaction', {
      order_id: orderId,
      refund_amount_cents: refundAmount,
      refund_reason: 'Manual refund via API',
      user_id: session.user.id
    });

    if (transactionError) {
      console.error('Error in refund transaction:', transactionError);
      return json({ error: 'Failed to process refund' }, { status: 500 });
    }

    // If transaction failed, return error
    if (!transactionResult || !transactionResult.success) {
      return json({ 
        error: transactionResult?.error || 'Refund processing failed' 
      }, { status: 400 });
    }

    return json({ success: true, refund_id: refund.id });
  } catch (error) {
    console.error('Error issuing refund:', error);
    const friendly = mapApiErrorToMessage(error);
    if (error instanceof Stripe.errors.StripeError) {
      return json({ error: friendly }, { status: 400 });
    }
    return json({ error: friendly }, { status: 500 });
  }
};


