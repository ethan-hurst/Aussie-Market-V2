import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// Use function-scoped env names (avoid SUPABASE_ prefix per platform rules)
const supabaseUrl = Deno.env.get('PUBLIC_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
	try {
		// Get auctions that have ended but not yet finalized
		const now = new Date().toISOString();
		const { data: endedAuctions, error: auctionError } = await supabase
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

		if (auctionError) {
			console.error('Error fetching ended auctions:', auctionError);
			return new Response(
				JSON.stringify({ error: 'Failed to fetch ended auctions' }),
				{ status: 500 }
			);
		}

		const auctions = endedAuctions as AuctionToFinalize[];
		console.log(`Found ${auctions.length} auctions to finalize`);

		const results: OrderResult[] = [];
		const errors: string[] = [];

		// Process each auction
		for (const auction of auctions) {
			try {
				console.log(`Processing auction ${auction.id}`);

				// Skip auctions without winning bids
				if (!auction.high_bid_id) {
					console.log(`Auction ${auction.id} has no winning bid, marking as no_sale`);
					await markAuctionAsNoSale(auction.id);
					continue;
				}

				// Create order from auction
				const orderResult = await createOrderFromAuction(auction);
				if (orderResult) {
					results.push(orderResult);
					console.log(`Created order ${orderResult.order_id} for auction ${auction.id}`);

					// Update auction status to finalized
					await supabase
						.from('auctions')
						.update({ status: 'finalized' })
						.eq('id', auction.id);

				} else {
					errors.push(`Failed to create order for auction ${auction.id}`);
				}

			} catch (error) {
				console.error(`Error processing auction ${auction.id}:`, error);
				errors.push(`Auction ${auction.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		}

		// Send notifications for successful orders
		for (const result of results) {
			try {
				await sendAuctionWinNotification(result);
			} catch (error) {
				console.error(`Error sending notification for order ${result.order_id}:`, error);
			}
		}

		const response = {
			success: true,
			processed: auctions.length,
			orders_created: results.length,
			errors: errors.length > 0 ? errors : undefined,
			results
		};

		console.log('Auction finalization complete:', response);

		return new Response(
			JSON.stringify(response),
			{
				headers: { 'Content-Type': 'application/json' },
				status: 200
			}
		);

	} catch (error) {
		console.error('Auction finalization error:', error);
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'Unknown error',
				success: false
			}),
			{ status: 500 }
		);
	}
});

async function createOrderFromAuction(auction: AuctionToFinalize): Promise<OrderResult | null> {
	try {
		// Get the winning bid details
		const { data: winningBid, error: bidError } = await supabase
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

		if (bidError || !winningBid) {
			console.error('Error fetching winning bid:', bidError);
			return null;
		}

		// Calculate fees (example: 5% platform fee)
		const platformFeeCents = Math.round(winningBid.amount_cents * 0.05);
		const sellerAmountCents = winningBid.amount_cents - platformFeeCents;

		// Create order
		const { data: order, error: orderError } = await supabase
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

		if (orderError) {
			console.error('Error creating order:', orderError);
			return null;
		}

		return {
			order_id: order.id,
			buyer_id: winningBid.bidder_id,
			seller_id: winningBid.listings.seller_id,
			amount_cents: winningBid.amount_cents
		};

	} catch (error) {
		console.error('Error in createOrderFromAuction:', error);
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

async function sendAuctionWinNotification(orderResult: OrderResult): Promise<void> {
	try {
		// Send notification to buyer
		await supabase
			.from('notifications')
			.insert({
				user_id: orderResult.buyer_id,
				type: 'auction_won',
				title: 'Congratulations! You won an auction',
				message: `You won the auction and an order has been created for $${(orderResult.amount_cents / 100).toFixed(2)}. Please complete your payment.`,
				metadata: { order_id: orderResult.order_id }
			});

		// Send notification to seller
		await supabase
			.from('notifications')
			.insert({
				user_id: orderResult.seller_id,
				type: 'auction_ended',
				title: 'Your auction has ended',
				message: `Your auction has ended with a winning bid of $${(orderResult.amount_cents / 100).toFixed(2)}. An order has been created.`,
				metadata: { order_id: orderResult.order_id }
			});

	} catch (error) {
		console.error('Error sending auction win notification:', error);
	}
}
