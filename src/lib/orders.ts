import { supabase } from './supabase';

export interface Order {
	id: string;
	listing_id: string;
	buyer_id: string;
	seller_id: string;
	amount_cents: number;
	state: 'pending' | 'paid' | 'ready_for_handover' | 'shipped' | 'delivered' | 'released' | 'refunded' | 'cancelled';
	payment_intent_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface OrderWithDetails extends Order {
	listings: {
		id: string;
		title: string;
		description: string;
		listing_photos: Array<{
			id: string;
			url: string;
			order_idx: number;
		}>;
	};
	buyer: {
		id: string;
		legal_name: string;
		email: string;
	};
	seller: {
		id: string;
		legal_name: string;
		email: string;
	};
}

// Create an order when auction ends
export async function createOrderFromAuction(auctionId: string): Promise<Order | null> {
	try {
		// This function is now primarily handled by the database function end_auction()
		// But we'll keep it as a fallback/manual method

		console.warn('createOrderFromAuction called - consider using the database function end_auction() instead');

		// Get auction details with winning bid
		const { data: auction, error: auctionError } = await supabase
			.from('auctions')
			.select(`
				*,
				listings!inner (
					id,
					seller_id,
					title,
					description,
					listing_photos (
						id,
						url,
						order_idx
					)
				),
				bids!inner (
					id,
					bidder_id,
					amount_cents
				)
			`)
			.eq('id', auctionId)
			.eq('status', 'ended')
			.single();

		if (auctionError || !auction) {
			throw new Error('Auction not found or not ended');
		}

		// Get the winning bid
		const winningBid = auction.bids[0];
		if (!winningBid) {
			throw new Error('No winning bid found');
		}

		// Calculate fees
		const platformFeeCents = Math.round(winningBid.amount_cents * 0.05);
		const sellerAmountCents = winningBid.amount_cents - platformFeeCents;

		// Create the order with comprehensive details
		const { data: order, error: orderError } = await supabase
			.from('orders')
			.insert({
				listing_id: auction.listing_id,
				buyer_id: winningBid.bidder_id,
				seller_id: auction.listings.seller_id,
				amount_cents: winningBid.amount_cents,
				platform_fee_cents: platformFeeCents,
				seller_amount_cents: sellerAmountCents,
				state: 'pending_payment',
				auction_id: auctionId,
				winning_bid_id: winningBid.id
			})
			.select()
			.single();

		if (orderError) {
			throw new Error('Failed to create order');
		}

		// Create payment intent automatically
		try {
			await createPaymentIntentForOrder(order.id);
		} catch (paymentError) {
			console.error('Failed to create payment intent for order:', paymentError);
			// Don't fail the order creation if payment intent creation fails
		}

		return order;
	} catch (error) {
		console.error('Error creating order from auction:', error);
		return null;
	}
}

/**
 * Create a payment intent for an auction win order
 */
export async function createPaymentIntentForOrder(orderId: string): Promise<string | null> {
	try {
		// This would integrate with your payment system (Stripe, etc.)
		// For now, we'll create a placeholder payment record

		const { data: order, error: orderError } = await supabase
			.from('orders')
			.select(`
				*,
				buyer:users!orders_buyer_id_fkey(email),
				listing:listings(title)
			`)
			.eq('id', orderId)
			.single();

		if (orderError || !order) {
			throw new Error('Order not found');
		}

		// Create a pending payment record
		const { data: payment, error: paymentError } = await supabase
			.from('payments')
			.insert({
				order_id: orderId,
				amount_cents: order.amount_cents,
				currency: 'aud',
				payment_method: 'stripe',
				status: 'pending',
				created_at: new Date().toISOString()
			})
			.select()
			.single();

		if (paymentError) {
			throw new Error('Failed to create payment record');
		}

		console.log(`Payment intent created for order ${orderId}`);

		// In a real implementation, you would:
		// 1. Call Stripe API to create a PaymentIntent
		// 2. Store the payment_intent_id in the order
		// 3. Return the client_secret for frontend use

		return payment.id;
	} catch (error) {
		console.error('Error creating payment intent:', error);
		return null;
	}
}

// Get user's orders (as buyer or seller)
export async function getUserOrders(userId: string): Promise<OrderWithDetails[]> {
	const { data, error } = await supabase
		.from('orders')
		.select(`
			*,
			listings (
				id,
				title,
				description,
				listing_photos (
					id,
					url,
					order_idx
				)
			),
			buyer:users!orders_buyer_id_fkey (
				id,
				legal_name,
				email
			),
			seller:users!orders_seller_id_fkey (
				id,
				legal_name,
				email
			)
		`)
		.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Error fetching orders:', error);
		return [];
	}

	return data || [];
}

// Get order details
export async function getOrderDetails(orderId: string): Promise<OrderWithDetails | null> {
	const { data, error } = await supabase
		.from('orders')
		.select(`
			*,
			listings (
				id,
				title,
				description,
				listing_photos (
					id,
					url,
					order_idx
				)
			),
			buyer:users!orders_buyer_id_fkey (
				id,
				legal_name,
				email
			),
			seller:users!orders_seller_id_fkey (
				id,
				legal_name,
				email
			)
		`)
		.eq('id', orderId)
		.single();

	if (error) {
		console.error('Error fetching order details:', error);
		return null;
	}

	return data;
}

// Update order state
export async function updateOrderState(orderId: string, newState: Order['state']): Promise<boolean> {
	const { error } = await supabase
		.from('orders')
		.update({ 
			state: newState,
			updated_at: new Date().toISOString()
		})
		.eq('id', orderId);

	if (error) {
		console.error('Error updating order state:', error);
		return false;
	}

	return true;
}

// Create payment intent for order
export async function createPaymentIntent(orderId: string): Promise<string | null> {
	try {
		// Get order details
		const order = await getOrderDetails(orderId);
		if (!order) {
			throw new Error('Order not found');
		}

		// Create payment intent with Stripe
		const response = await fetch('/api/payments/create-intent', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				orderId: orderId,
				amount: order.amount_cents,
				currency: 'aud'
			})
		});

		if (!response.ok) {
			throw new Error('Failed to create payment intent');
		}

		const { clientSecret } = await response.json();
		return clientSecret;
	} catch (error) {
		console.error('Error creating payment intent:', error);
		return null;
	}
}

// Confirm payment for order
export async function confirmPayment(orderId: string, paymentIntentId: string): Promise<boolean> {
	try {
		// Update order with payment intent ID and mark as paid
		const { error } = await supabase
			.from('orders')
			.update({
				payment_intent_id: paymentIntentId,
				state: 'paid',
				updated_at: new Date().toISOString()
			})
			.eq('id', orderId);

		if (error) {
			throw new Error('Failed to update order');
		}

		// Create ledger entry for the payment
		await createLedgerEntry(orderId, 'payment_received', 'Payment received for order');

		return true;
	} catch (error) {
		console.error('Error confirming payment:', error);
		return false;
	}
}

// Create ledger entry
async function createLedgerEntry(orderId: string, type: string, description: string): Promise<void> {
	try {
		await supabase
			.from('ledger_entries')
			.insert({
				order_id: orderId,
				type,
				description,
				amount_cents: 0 // Will be calculated based on order
			});
	} catch (error) {
		console.error('Error creating ledger entry:', error);
	}
}

// Get order status color
export function getOrderStatusColor(state: Order['state']): string {
	const colors = {
		pending: 'text-yellow-600 bg-yellow-100',
		paid: 'text-blue-600 bg-blue-100',
		ready_for_handover: 'text-purple-600 bg-purple-100',
		shipped: 'text-indigo-600 bg-indigo-100',
		delivered: 'text-green-600 bg-green-100',
		released: 'text-green-600 bg-green-100',
		refunded: 'text-red-600 bg-red-100',
		cancelled: 'text-gray-600 bg-gray-100'
	};
	return colors[state] || 'text-gray-600 bg-gray-100';
}

// Get order status label
export function getOrderStatusLabel(state: Order['state']): string {
	const labels = {
		pending: 'Pending Payment',
		paid: 'Payment Received',
		ready_for_handover: 'Ready for Handover',
		shipped: 'Shipped',
		delivered: 'Delivered',
		released: 'Funds Released',
		refunded: 'Refunded',
		cancelled: 'Cancelled'
	};
	return labels[state] || state;
}

// Format price
export function formatPrice(cents: number): string {
	return new Intl.NumberFormat('en-AU', {
		style: 'currency',
		currency: 'AUD'
	}).format(cents / 100);
}

// Check if user can perform action on order
export function canPerformAction(order: Order, userId: string, action: string): boolean {
	switch (action) {
		case 'pay':
			return order.buyer_id === userId && order.state === 'pending';
		case 'mark_ready':
			return order.seller_id === userId && order.state === 'paid';
		case 'mark_shipped':
			return order.seller_id === userId && order.state === 'ready_for_handover';
		case 'confirm_delivery':
			return order.buyer_id === userId && order.state === 'shipped';
		case 'release_funds':
			return order.buyer_id === userId && order.state === 'delivered';
		case 'cancel':
			return (order.buyer_id === userId || order.seller_id === userId) && 
				   ['pending', 'paid'].includes(order.state);
		default:
			return false;
	}
}

// Real-time order subscriptions
export function subscribeToOrderUpdates(orderId: string, callback: (order: OrderWithDetails) => void) {
	return supabase
		.channel(`order-${orderId}`)
		.on('postgres_changes', {
			event: 'UPDATE',
			schema: 'public',
			table: 'orders',
			filter: `id=eq.${orderId}`
		}, async (payload) => {
			// Fetch updated order with all details
			const updatedOrder = await getOrderDetails(orderId);
			if (updatedOrder) {
				callback(updatedOrder);
			}
		})
		.subscribe();
}

export function subscribeToUserOrders(userId: string, callback: (orders: OrderWithDetails[]) => void) {
	return supabase
		.channel(`user-orders-${userId}`)
		.on('postgres_changes', {
			event: '*',
			schema: 'public',
			table: 'orders',
			filter: `buyer_id=eq.${userId} OR seller_id=eq.${userId}`
		}, async () => {
			// Fetch updated orders list
			const orders = await getUserOrders(userId);
			callback(orders);
		})
		.subscribe();
}

// Enhanced order actions with real-time updates
export async function updateOrderStateWithNotification(
	orderId: string, 
	newState: Order['state'], 
	userId: string,
	notificationType?: 'order_shipped' | 'order_delivered'
): Promise<boolean> {
	try {
		const { error } = await supabase
			.from('orders')
			.update({
				state: newState,
				updated_at: new Date().toISOString()
			})
			.eq('id', orderId);

		if (error) {
			console.error('Error updating order state:', error);
			return false;
		}

		// Send notification if specified
		if (notificationType) {
			const order = await getOrderDetails(orderId);
			if (order) {
				switch (notificationType) {
					case 'order_shipped':
						await notifyOrderShipped(orderId, order.buyer_id);
						break;
					case 'order_delivered':
						await notifyOrderDelivered(orderId, order.seller_id);
						break;
				}
			}
		}

		return true;
	} catch (error) {
		console.error('Error in updateOrderStateWithNotification:', error);
		return false;
	}
}
