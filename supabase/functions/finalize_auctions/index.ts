import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createLogger, measureTime } from '../../src/lib/edge-logger.ts';
import { Metrics, setupMetricsCleanup } from '../../src/lib/edge-metrics.ts';

// Use function-scoped env names (avoid SUPABASE_ prefix per platform rules)
const supabaseUrl = Deno.env.get('PUBLIC_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Setup metrics cleanup
const cleanup = setupMetricsCleanup();

interface AuctionToFinalize {
	id: string;
	listing_id: string;
	high_bid_id: string | null;
	current_price_cents: number;
	status: string;
}

interface OrderResult {
	order_id: string;
	buyer_id: string;
	seller_id: string;
	amount_cents: number;
}

serve(async (req) => {
	const logger = createLogger('finalize_auctions', {
		requestId: crypto.randomUUID()
	});

	try {
		logger.info('Starting auction finalization process');

		// Get auctions that have ended but not yet finalized
		const now = new Date().toISOString();
		const { data: endedAuctions, error: auctionError } = await measureTime(
			logger,
			'fetch_ended_auctions',
			async () => {
				return await supabase
					.from('auctions')
					.select(`
						id,
						listing_id,
						high_bid_id,
						current_price_cents,
						status,
						listings!inner(
							id,
							seller_id,
							title,
							end_at
						)
					`)
					.eq('status', 'ended')
					.lt('listings.end_at', now);
			}
		);

		if (auctionError) {
			logger.error('Failed to fetch ended auctions', auctionError);
			Metrics.errorOccurred('fetch_ended_auctions', auctionError);
			return new Response(
				JSON.stringify({ 
					error: 'Failed to fetch ended auctions',
					requestId: logger.getRequestId()
				}),
				{ status: 500 }
			);
		}

		const auctions = endedAuctions as AuctionToFinalize[];
		logger.info(`Found ${auctions.length} auctions to finalize`, {
			auction_count: auctions.length
		});
		logger.counter('auctions_found', auctions.length);

		const results: OrderResult[] = [];
		const errors: string[] = [];

		// Process each auction
		for (const auction of auctions) {
			const auctionLogger = logger.child({ auctionId: auction.id, listingId: auction.listing_id });
			
			try {
				auctionLogger.info('Processing auction for finalization');

				// Skip auctions without winning bids
				if (!auction.high_bid_id) {
					auctionLogger.info('Auction has no winning bid, marking as no_sale');
					await measureTime(auctionLogger, 'mark_no_sale', async () => {
						await markAuctionAsNoSale(auction.id);
					});
					Metrics.auctionNoSale(auction.id);
					continue;
				}

				// Idempotency: skip if an order already exists for this auction
				const existing = await measureTime(auctionLogger, 'check_existing_order', async () => {
					return await supabase
						.from('orders')
						.select('id')
						.eq('auction_id', auction.id)
						.maybeSingle();
				});

				if (existing.data?.id) {
					auctionLogger.info('Order already exists, skipping', { existingOrderId: existing.data.id });
					logger.counter('auction_skipped_duplicate', 1);
					continue;
				}

				// Create order from auction
				const orderResult = await measureTime(auctionLogger, 'create_order', async () => {
					return await createOrderFromAuction(auction, auctionLogger);
				});

				if (orderResult) {
					results.push(orderResult);
					auctionLogger.info('Successfully created order', { 
						orderId: orderResult.order_id,
						amountCents: orderResult.amount_cents
					});

					// Update auction status to finalized
					await measureTime(auctionLogger, 'update_auction_status', async () => {
						await supabase
							.from('auctions')
							.update({ status: 'finalized' })
							.eq('id', auction.id);
					});

					Metrics.auctionFinalized(auction.id, orderResult.order_id);
					Metrics.orderCreated(orderResult.order_id, orderResult.amount_cents);

				} else {
					const errorMsg = `Failed to create order for auction ${auction.id}`;
					auctionLogger.error(errorMsg);
					errors.push(errorMsg);
					Metrics.errorOccurred('create_order', new Error(errorMsg), { auctionId: auction.id });
				}

			} catch (error) {
				const errorMsg = `Error processing auction ${auction.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
				auctionLogger.error('Failed to process auction', error as Error);
				errors.push(errorMsg);
				Metrics.errorOccurred('process_auction', error as Error, { auctionId: auction.id });
			}
		}

		// Send notifications for successful orders
		for (const result of results) {
			try {
				await measureTime(logger, 'send_notifications', async () => {
					await sendAuctionWinNotification(result, logger);
				});
			} catch (error) {
				logger.error(`Error sending notification for order ${result.order_id}`, error as Error);
				Metrics.errorOccurred('send_notification', error as Error, { orderId: result.order_id });
			}
		}

		const response = {
			success: true,
			processed: auctions.length,
			orders_created: results.length,
			errors: errors.length > 0 ? errors : undefined,
			results,
			requestId: logger.getRequestId(),
			timestamp: new Date().toISOString()
		};

		logger.info('Auction finalization complete', {
			processed: auctions.length,
			orders_created: results.length,
			errors_count: errors.length
		});

		// Log final metrics
		logger.counter('auctions_processed', auctions.length);
		logger.counter('orders_created', results.length);
		if (errors.length > 0) {
			logger.counter('errors_occurred', errors.length);
		}

		// Function execution metric
		Metrics.functionExecuted('finalize_auctions', Date.now() - logger['startTime'], true);

		return new Response(
			JSON.stringify(response),
			{
				headers: { 'Content-Type': 'application/json' },
				status: 200
			}
		);

	} catch (error) {
		logger.error('Auction finalization failed', error as Error);
		Metrics.errorOccurred('finalize_auctions', error as Error);
		Metrics.functionExecuted('finalize_auctions', Date.now() - logger['startTime'], false);
		
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'Unknown error',
				success: false,
				requestId: logger.getRequestId(),
				timestamp: new Date().toISOString()
			}),
			{ status: 500 }
		);
	} finally {
		// Ensure metrics are flushed
		cleanup();
	}
});

async function createOrderFromAuction(auction: AuctionToFinalize, logger: any): Promise<OrderResult | null> {
	try {
		// Get the winning bid details
		const { data: winningBid, error: bidError } = await measureTime(logger, 'fetch_winning_bid', async () => {
			return await supabase
				.from('bids')
				.select(`
					id,
					bidder_id,
					amount_cents,
					listings!inner(
						id,
						seller_id,
						title
					)
				`)
				.eq('id', auction.high_bid_id)
				.single();
		});

		if (bidError || !winningBid) {
			logger.error('Error fetching winning bid', bidError);
			return null;
		}

		// Calculate fees (example: 5% platform fee)
		const platformFeeCents = Math.round(winningBid.amount_cents * 0.05);
		const sellerAmountCents = winningBid.amount_cents - platformFeeCents;

		logger.debug('Calculated fees', {
			amountCents: winningBid.amount_cents,
			platformFeeCents,
			sellerAmountCents
		});

		// Create order
		const { data: order, error: orderError } = await measureTime(logger, 'insert_order', async () => {
			return await supabase
				.from('orders')
				.insert({
					listing_id: auction.listing_id,
					buyer_id: winningBid.bidder_id,
					seller_id: winningBid.listings.seller_id,
					amount_cents: winningBid.amount_cents,
					platform_fee_cents: platformFeeCents,
					seller_amount_cents: sellerAmountCents,
					state: 'pending_payment',
					auction_id: auction.id,
					winning_bid_id: winningBid.id
				})
				.select()
				.single();
		});

		if (orderError) {
			logger.error('Error creating order', orderError);
			return null;
		}

		logger.info('Order created successfully', {
			orderId: order.id,
			buyerId: winningBid.bidder_id,
			sellerId: winningBid.listings.seller_id,
			amountCents: winningBid.amount_cents
		});

		return {
			order_id: order.id,
			buyer_id: winningBid.bidder_id,
			seller_id: winningBid.listings.seller_id,
			amount_cents: winningBid.amount_cents
		};

	} catch (error) {
		logger.error('Error in createOrderFromAuction', error as Error);
		return null;
	}
}

async function markAuctionAsNoSale(auctionId: string): Promise<void> {
	const { error } = await supabase
		.from('auctions')
		.update({ status: 'no_sale' })
		.eq('id', auctionId);

	if (error) {
		console.error('Error marking auction as no_sale:', error);
	}
}

async function sendAuctionWinNotification(orderResult: OrderResult, logger: any): Promise<void> {
	try {
		logger.info('Sending auction win notifications', {
			orderId: orderResult.order_id,
			buyerId: orderResult.buyer_id,
			sellerId: orderResult.seller_id
		});

		// Send notification to buyer
		await measureTime(logger, 'send_buyer_notification', async () => {
			await supabase
				.from('notifications')
				.insert({
					user_id: orderResult.buyer_id,
					type: 'auction_won',
					title: 'Congratulations! You won an auction',
					message: `You won the auction and an order has been created for $${(orderResult.amount_cents / 100).toFixed(2)}. Please complete your payment.`,
					metadata: { order_id: orderResult.order_id }
				});
		});

		// Send notification to seller
		await measureTime(logger, 'send_seller_notification', async () => {
			await supabase
				.from('notifications')
				.insert({
					user_id: orderResult.seller_id,
					type: 'auction_ended',
					title: 'Your auction has ended',
					message: `Your auction has ended with a winning bid of $${(orderResult.amount_cents / 100).toFixed(2)}. An order has been created.`,
					metadata: { order_id: orderResult.order_id }
				});
		});

		// Log notification metrics
		Metrics.notificationSent(orderResult.buyer_id, 'auction_won');
		Metrics.notificationSent(orderResult.seller_id, 'auction_ended');

		logger.info('Successfully sent auction win notifications');

	} catch (error) {
		logger.error('Error sending auction win notification', error as Error);
		throw error;
	}
}
