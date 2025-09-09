import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import { supabase } from '$lib/supabase';
import { notifyOrderShipped, notifyOrderDelivered } from '$lib/notifications';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/security';
import { validate, OrderActionSchema } from '$lib/validation';
import { getSessionUserFromLocals } from '$lib/session';
import { ApiErrorHandler } from '$lib/api-error-handler';
import { recordBusinessEvent } from '$lib/server/kpi-metrics-server';

export const GET: RequestHandler = async ({ params, locals, request, url }) => {
	const startTime = Date.now();
	
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserFromLocals(locals);

		const { orderId } = params;
		if (!orderId) {
			console.warn('Order GET request without orderId', { 
				userId: user?.id, 
				path: url.pathname 
			});
			return json({ error: 'Order ID required' }, { status: 400 });
		}

		// Enhanced logging for order access
		console.info(`Fetching order ${orderId} for user ${user.id}`, {
			orderId, userId: user.id, userAgent: request.headers.get('user-agent')
		});

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

		const queryTime = Date.now() - startTime;

		if (error) {
			console.error(`Database error fetching order ${orderId}:`, {
				error: error.message,
				code: error.code,
				details: error.details,
				orderId,
				userId: user.id,
				queryTimeMs: queryTime
			});
			return ApiErrorHandler.handleDatabaseError(
				error, 
				{ request, locals, params, url }, 
				{ 
					operation: 'fetch_order', 
					userId: user.id,
					query: `orders.select(*).eq(id, ${orderId})`
				}
			);
		}

		if (!order) {
			console.warn(`Order ${orderId} not found`, { 
				orderId, userId: user.id, queryTimeMs: queryTime 
			});
			return json({ error: 'Order not found' }, { status: 404 });
		}

		// Check if user is authorized to view this order
		if (order.buyer_id !== user.id && order.seller_id !== user.id) {
			console.warn(`Unauthorized access attempt to order ${orderId}`, {
				orderId, userId: user.id, 
				buyerId: order.buyer_id, sellerId: order.seller_id,
				orderState: order.state
			});
			return json({ error: 'Unauthorized to view this order' }, { status: 403 });
		}

		// Record successful order access for analytics
		const responseTime = Date.now() - startTime;
		console.info(`Successfully fetched order ${orderId}`, {
			orderId, userId: user.id,
			orderState: order.state,
			responseTimeMs: responseTime,
			queryTimeMs: queryTime,
			isListingIncluded: !!order.listing,
			userRole: order.buyer_id === user.id ? 'buyer' : 'seller'
		});

		// Add performance metrics to response for debugging
		const enrichedOrder = {
			...order,
			_debug: {
				responseTimeMs: responseTime,
				queryTimeMs: queryTime,
				fetchedAt: new Date().toISOString()
			}
		};

		return json(enrichedOrder);
	} catch (error) {
		console.error(`Unexpected error fetching order ${params.orderId}:`, {
			error: error instanceof Error ? error.message : 'Unknown error',
			orderId: params.orderId,
			processingTimeMs: Date.now() - startTime
		});
		
		// Handle authentication errors gracefully
		if (error instanceof Response) {
			return error;
		}
		return ApiErrorHandler.handleError(error as Error, { request, locals, params, url }, {
			operation: 'get_order',
			userId: undefined // User not available in catch scope
		});
	}
};

export const POST: RequestHandler = async ({ params, request, locals, url }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserFromLocals(locals);

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

		// Helper to update state with atomic transaction and consistency check
		async function updateState(newState: string) {
			const updateTimestamp = new Date().toISOString();
			
			// Atomic update with optimistic concurrency control
			const { data: updatedOrder, error } = await supabase
				.from('orders')
				.update({ 
					state: newState, 
					updated_at: updateTimestamp 
				})
				.eq('id', orderId)
				.eq('state', state) // Ensure state hasn't changed since we fetched it
				.select('id, state, updated_at')
				.single();

			if (error) {
				if (error.code === 'PGRST116') {
					// No rows updated - state changed concurrently
					throw new Error('Order state was modified by another request. Please refresh and try again.');
				}
				throw error;
			}

			// Verify read-after-write consistency
			if (updatedOrder.state !== newState) {
				throw new Error(`State update failed: expected ${newState}, got ${updatedOrder.state}`);
			}

			// Cache invalidation - mark order for refresh
			try {
				await supabase
					.from('cache_invalidation')
					.insert({
						resource_type: 'order',
						resource_id: orderId,
						invalidated_at: updateTimestamp
					});
			} catch (cacheError) {
				// Log cache invalidation error but don't fail the update
				console.warn('Failed to invalidate order cache:', cacheError);
			}

			return updatedOrder;
		}

		// Helper to insert ledger entry with enhanced error handling
		async function ledger(type: string, description: string, amount_cents = 0) {
			try {
				const { data, error } = await supabase
					.from('ledger_entries')
					.insert({
						order_id: orderId,
						type,
						description,
						amount_cents,
						created_at: new Date().toISOString(),
						user_id: user.id // Add user context for audit trail
					})
					.select()
					.single();

				if (error) {
					console.error(`Failed to create ledger entry for order ${orderId}:`, error);
					// Don't throw - ledger entries are audit trail, not critical path
				} else {
					console.info(`Ledger entry created for order ${orderId}:`, { type, description, amount_cents });
				}

				return data;
			} catch (ledgerError) {
				console.error(`Unexpected error creating ledger entry for order ${orderId}:`, ledgerError);
				// Return null to indicate failure but don't interrupt the main flow
				return null;
			}
		}

		const userId = user.id;
		const isBuyer = order.buyer_id === userId;
		const isSeller = order.seller_id === userId;
		const state: string = order.state;

		// Support both 'pending' and 'pending_payment' as unpaid states
		const isUnpaid = state === 'pending' || state === 'pending_payment';

		switch (action) {
			case 'mark_ready': {
				const actionStartTime = Date.now();
				
				if (!isSeller || state !== 'paid') {
					console.warn(`Unauthorized mark_ready attempt: user=${userId}, isSeller=${isSeller}, state=${state}`, {
						orderId, userId, orderState: state
					});
					return json({ error: 'Forbidden: Only seller can mark paid orders ready' }, { status: 403 });
				}
				
				try {
					const updatedOrder = await updateState('ready_for_handover');
					await ledger('mark_ready', 'Seller marked order ready for handover');
					
					console.info(`Order ${orderId} marked ready by seller ${userId}`, {
						orderId, userId, newState: 'ready_for_handover',
						processingTimeMs: Date.now() - actionStartTime
					});
					
					return json({ 
						success: true, 
						state: 'ready_for_handover',
						updated_at: updatedOrder.updated_at,
						processingTimeMs: Date.now() - actionStartTime
					});
				} catch (error) {
					console.error(`Failed to mark order ${orderId} ready:`, error);
					return json({ error: (error as Error).message || 'Failed to update order state' }, { status: 500 });
				}
			}
			case 'mark_shipped': {
				const actionStartTime = Date.now();
				
				if (!isSeller || state !== 'ready_for_handover') {
					console.warn(`Unauthorized mark_shipped attempt: user=${userId}, isSeller=${isSeller}, state=${state}`, {
						orderId, userId, orderState: state
					});
					return json({ error: 'Forbidden: Only seller can ship ready orders' }, { status: 403 });
				}
				
				try {
					const updatedOrder = await updateState('shipped');
					await ledger('shipped', 'Seller marked order shipped');
					
					// Notify buyer with error handling
					try {
						await notifyOrderShipped(orderId, order.buyer_id);
					} catch (notificationError) {
						console.error(`Failed to notify buyer ${order.buyer_id} about shipping:`, notificationError);
						// Don't fail the request if notification fails
					}
					
					console.info(`Order ${orderId} marked shipped by seller ${userId}`, {
						orderId, userId, buyerId: order.buyer_id,
						processingTimeMs: Date.now() - actionStartTime
					});
					
					return json({ 
						success: true, 
						state: 'shipped',
						updated_at: updatedOrder.updated_at,
						processingTimeMs: Date.now() - actionStartTime
					});
				} catch (error) {
					console.error(`Failed to mark order ${orderId} shipped:`, error);
					return json({ error: (error as Error).message || 'Failed to update order state' }, { status: 500 });
				}
			}
			case 'confirm_delivery': {
				const actionStartTime = Date.now();
				
				if (!isBuyer || state !== 'shipped') {
					console.warn(`Unauthorized confirm_delivery attempt: user=${userId}, isBuyer=${isBuyer}, state=${state}`, {
						orderId, userId, orderState: state
					});
					return json({ error: 'Forbidden: Only buyer can confirm delivery of shipped orders' }, { status: 403 });
				}
				
				try {
					const updatedOrder = await updateState('delivered');
					await ledger('delivered', 'Buyer confirmed delivery');
					
					// Notify seller with error handling
					try {
						await notifyOrderDelivered(orderId, order.seller_id);
					} catch (notificationError) {
						console.error(`Failed to notify seller ${order.seller_id} about delivery:`, notificationError);
						// Don't fail the request if notification fails
					}
					
					console.info(`Order ${orderId} delivery confirmed by buyer ${userId}`, {
						orderId, userId, sellerId: order.seller_id,
						processingTimeMs: Date.now() - actionStartTime
					});
					
					return json({ 
						success: true, 
						state: 'delivered',
						updated_at: updatedOrder.updated_at,
						processingTimeMs: Date.now() - actionStartTime
					});
				} catch (error) {
					console.error(`Failed to confirm delivery for order ${orderId}:`, error);
					return json({ error: (error as Error).message || 'Failed to update order state' }, { status: 500 });
				}
			}
			case 'release_funds': {
				const actionStartTime = Date.now();
				
				if (!isBuyer || state !== 'delivered') {
					console.warn(`Unauthorized release_funds attempt: user=${userId}, isBuyer=${isBuyer}, state=${state}`, {
						orderId, userId, orderState: state
					});
					return json({ error: 'Forbidden: Only buyer can release funds for delivered orders' }, { status: 403 });
				}
				
				try {
					const updatedOrder = await updateState('released');
					// Release seller funds (logical entry only; payouts handled separately)
					const sellerAmount = order.seller_amount_cents || 0;
					await ledger('funds_released', 'Buyer released funds to seller', sellerAmount);
					
					console.info(`Funds released for order ${orderId} by buyer ${userId}`, {
						orderId, userId, sellerId: order.seller_id, sellerAmount,
						processingTimeMs: Date.now() - actionStartTime
					});
					
					return json({ 
						success: true, 
						state: 'released',
						sellerAmount,
						updated_at: updatedOrder.updated_at,
						processingTimeMs: Date.now() - actionStartTime
					});
				} catch (error) {
					console.error(`Failed to release funds for order ${orderId}:`, error);
					return json({ error: (error as Error).message || 'Failed to release funds' }, { status: 500 });
				}
			}
			case 'cancel': {
				const actionStartTime = Date.now();
				
				if (!(isBuyer || isSeller) || !(isUnpaid || state === 'paid')) {
					console.warn(`Unauthorized cancel attempt: user=${userId}, isBuyer=${isBuyer}, isSeller=${isSeller}, state=${state}`, {
						orderId, userId, orderState: state
					});
					return json({ error: 'Forbidden: Only buyer or seller can cancel unpaid or paid orders' }, { status: 403 });
				}
				
				try {
					const updatedOrder = await updateState('cancelled');
					const cancelReason = isBuyer ? 'Buyer cancelled order' : 'Seller cancelled order';
					await ledger('cancelled', cancelReason);
					
					console.info(`Order ${orderId} cancelled by ${isBuyer ? 'buyer' : 'seller'} ${userId}`, {
						orderId, userId, cancelReason, previousState: state,
						processingTimeMs: Date.now() - actionStartTime
					});
					
					return json({ 
						success: true, 
						state: 'cancelled',
						updated_at: updatedOrder.updated_at,
						processingTimeMs: Date.now() - actionStartTime
					});
				} catch (error) {
					console.error(`Failed to cancel order ${orderId}:`, error);
					return json({ error: (error as Error).message || 'Failed to cancel order' }, { status: 500 });
				}
			}
			case 'refund': {
				const actionStartTime = Date.now();
				
				// Simple refund flow; Stripe refund should be handled by payments API/webhook
				if (!isSeller || !(state === 'paid' || state === 'shipped' || state === 'delivered')) {
					console.warn(`Unauthorized refund attempt: user=${userId}, isSeller=${isSeller}, state=${state}`, {
						orderId, userId, orderState: state
					});
					return json({ error: 'Forbidden: Only seller can refund paid/shipped/delivered orders' }, { status: 403 });
				}
				
				try {
					const updatedOrder = await updateState('refunded');
					const refundAmount = order.amount_cents || 0;
					await ledger('refund_issued', 'Seller issued refund', refundAmount);
					
					console.info(`Refund issued for order ${orderId} by seller ${userId}`, {
						orderId, userId, buyerId: order.buyer_id, refundAmount,
						processingTimeMs: Date.now() - actionStartTime
					});
					
					return json({ 
						success: true, 
						state: 'refunded',
						refundAmount,
						updated_at: updatedOrder.updated_at,
						processingTimeMs: Date.now() - actionStartTime
					});
				} catch (error) {
					console.error(`Failed to process refund for order ${orderId}:`, error);
					return json({ error: (error as Error).message || 'Failed to process refund' }, { status: 500 });
				}
			}
			default:
				return json({ error: 'Unsupported action' }, { status: 400 });
		}

	} catch (error) {
		// Handle authentication errors gracefully
		if (error instanceof Response) {
			return error;
		}
		return ApiErrorHandler.handleError(error as Error, { request, locals, params, url }, {
			operation: 'order_action',
			userId: undefined // User not available in catch scope
		});
	}
};
