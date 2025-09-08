import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import { supabase } from '$lib/supabase';
import { notifyOrderShipped, notifyOrderDelivered } from '$lib/notifications';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/security';
import { validate, OrderActionSchema } from '$lib/validation';
import { getSessionUserOrThrow } from '$lib/session';
import { recordOrderCreated, recordPaymentSuccess } from '$lib/server/kpi-metrics-server';

export const GET: RequestHandler = async ({ params, locals, request }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserOrThrow({ request, locals } as any);

		const { orderId } = params;
		if (!orderId) {
			return json({ error: 'Order ID required' }, { status: 400 });
		}

		// Fetch order with all related data
		const { data: order, error } = await supabase
			.from('orders')
			.select(`
				*,
				listing:listings(
					id,
					title,
					description,
					starting_price_cents,
					reserve_price_cents,
					end_time,
					status,
					listing_photos(url, order_idx)
				),
				buyer:users!orders_buyer_id_fkey(
					id,
					legal_name,
					email,
					phone
				),
				seller:users!orders_seller_id_fkey(
					id,
					legal_name,
					email,
					phone
				),
				winning_bid:bids!orders_winning_bid_id_fkey(
					id,
					amount_cents,
					created_at
				)
			`)
			.eq('id', orderId)
			.single();

		if (error) {
			console.error('Error fetching order:', error);
			return json({ error: 'Failed to fetch order' }, { status: 500 });
		}

		if (!order) {
			return json({ error: 'Order not found' }, { status: 404 });
		}

		// Check if user is authorized to view this order
		if (order.buyer_id !== user.id && order.seller_id !== user.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		return json(order);
	} catch (error) {
		console.error('Error in order API:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserOrThrow({ request, locals } as any);

		// Rate limit order actions per user (e.g., 20 actions per 5 minutes)
		const rl = rateLimit(`order-actions:${user.id}`, 20, 5 * 60_000);
		if (!rl.allowed) {
			return json(
				{ error: 'Too many requests. Please slow down.' },
				{ status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} }
			);
		}

		const { orderId } = params;
		if (!orderId) {
			return json({ error: 'Order ID required' }, { status: 400 });
		}

		const parsed = validate(OrderActionSchema, await request.json());
		if (!parsed.ok) {
			return json({ error: mapApiErrorToMessage(parsed.error) }, { status: 400 });
		}
		const { action } = parsed.value as any;

		// Fetch order
		const { data: order, error: orderError } = await supabase
			.from('orders')
			.select('*')
			.eq('id', orderId)
			.single();

		if (orderError || !order) {
			return json({ error: 'Order not found' }, { status: 404 });
		}

		// Helper to update state
		async function updateState(newState: string) {
			const { error } = await supabase
				.from('orders')
				.update({ state: newState, updated_at: new Date().toISOString() })
				.eq('id', orderId);
			if (error) throw error;
		}

		// Helper to insert ledger entry (best-effort)
		async function ledger(type: string, description: string, amount_cents = 0) {
			await supabase.from('ledger_entries').insert({
				order_id: orderId,
				type,
				description,
				amount_cents
			});
		}

		const userId = user.id;
		const isBuyer = order.buyer_id === userId;
		const isSeller = order.seller_id === userId;
		const state: string = order.state;

		// Support both 'pending' and 'pending_payment' as unpaid states
		const isUnpaid = state === 'pending' || state === 'pending_payment';

		switch (action) {
			case 'mark_ready': {
				if (!isSeller || state !== 'paid') return json({ error: 'Forbidden' }, { status: 403 });
				await updateState('ready_for_handover');
				await ledger('mark_ready', 'Seller marked order ready for handover');
				return json({ success: true, state: 'ready_for_handover' });
			}
			case 'mark_shipped': {
				if (!isSeller || state !== 'ready_for_handover') return json({ error: 'Forbidden' }, { status: 403 });
				await updateState('shipped');
				await ledger('shipped', 'Seller marked order shipped');
				// Notify buyer
				await notifyOrderShipped(orderId, order.buyer_id);
				return json({ success: true, state: 'shipped' });
			}
			case 'confirm_delivery': {
				if (!isBuyer || state !== 'shipped') return json({ error: 'Forbidden' }, { status: 403 });
				await updateState('delivered');
				await ledger('delivered', 'Buyer confirmed delivery');
				// Notify seller
				await notifyOrderDelivered(orderId, order.seller_id);
				return json({ success: true, state: 'delivered' });
			}
			case 'release_funds': {
				if (!isBuyer || state !== 'delivered') return json({ error: 'Forbidden' }, { status: 403 });
				await updateState('released');
				// Release seller funds (logical entry only; payouts handled separately)
				const sellerAmount = order.seller_amount_cents || 0;
				await ledger('funds_released', 'Buyer released funds to seller', sellerAmount);
				return json({ success: true, state: 'released' });
			}
			case 'cancel': {
				if (!(isBuyer || isSeller) || !(isUnpaid || state === 'paid')) {
					return json({ error: 'Forbidden' }, { status: 403 });
				}
				await updateState('cancelled');
				await ledger('cancelled', 'Order cancelled');
				return json({ success: true, state: 'cancelled' });
			}
			case 'refund': {
				// Simple refund flow; Stripe refund should be handled by payments API/webhook
				if (!isSeller || !(state === 'paid' || state === 'shipped' || state === 'delivered')) {
					return json({ error: 'Forbidden' }, { status: 403 });
				}
				await updateState('refunded');
				await ledger('refund_issued', 'Seller issued refund', order.amount_cents || 0);
				return json({ success: true, state: 'refunded' });
			}
			default:
				return json({ error: 'Unsupported action' }, { status: 400 });
		}

	} catch (error) {
		console.error('Error in order action API:', error);
		return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
	}
};
