import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface AuctionToProcess {
	id: string;
	listing_id: string;
	title: string;
	end_at: string;
	status: string;
}

serve(async (req) => {
	try {
		console.log('Starting expired auctions processing...');

		// Get all auctions that have expired but haven't been processed
		const now = new Date().toISOString();
		const { data: expiredAuctions, error: auctionError } = await supabase
			.from('auctions')
			.select(`
				id,
				listing_id,
				status,
				listings!inner(
					title,
					end_at
				)
			`)
			.eq('status', 'live')
			.lt('listings.end_at', now);

		if (auctionError) {
			console.error('Error fetching expired auctions:', auctionError);
			return new Response(
				JSON.stringify({ error: 'Failed to fetch expired auctions' }),
				{ status: 500 }
			);
		}

		const auctions = expiredAuctions as AuctionToProcess[];
		console.log(`Found ${auctions.length} expired auctions to process`);

		const results = [];
		const errors = [];

		// Process each expired auction
		for (const auction of auctions) {
			try {
				console.log(`Processing auction: ${auction.id} - ${auction.listings.title}`);

				// Call the database function to end the auction
				const { data: endResult, error: endError } = await supabase.rpc('end_auction', {
					auction_id: auction.id
				});

				if (endError) {
					console.error(`Error ending auction ${auction.id}:`, endError);
					errors.push({
						auction_id: auction.id,
						title: auction.listings.title,
						error: endError.message
					});
				} else {
					console.log(`Successfully processed auction ${auction.id}:`, endResult);
					results.push({
						auction_id: auction.id,
						title: auction.listings.title,
						result: endResult
					});
				}

				// Small delay between auctions to avoid overwhelming the database
				await new Promise(resolve => setTimeout(resolve, 100));

			} catch (error) {
				console.error(`Exception processing auction ${auction.id}:`, error);
				errors.push({
					auction_id: auction.id,
					title: auction.listings.title,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}

		// Log summary
		const summary = {
			total_processed: auctions.length,
			successful: results.length,
			failed: errors.length,
			timestamp: new Date().toISOString(),
			results,
			errors
		};

		console.log('Auction processing complete:', summary);

		// Create a log entry for monitoring
		await supabase
			.from('metrics')
			.insert({
				metric_type: 'auction_processing',
				metric_name: 'expired_auctions_processed',
				value: auctions.length,
				metadata: summary,
				recorded_at: new Date().toISOString()
			});

		return new Response(
			JSON.stringify(summary),
			{
				headers: { 'Content-Type': 'application/json' },
				status: 200
			}
		);

	} catch (error) {
		console.error('Auction processing error:', error);
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: new Date().toISOString()
			}),
			{ status: 500 }
		);
	}
});
