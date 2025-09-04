import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createLogger, measureTime } from '../../src/lib/edge-logger.ts';
import { Metrics, setupMetricsCleanup } from '../../src/lib/edge-metrics.ts';
import { RetryOperations } from '../../src/lib/retry-strategies.ts';

// Use function-scoped env names (avoid SUPABASE_ prefix per platform rules)
const supabaseUrl = Deno.env.get('PUBLIC_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Setup metrics cleanup
const cleanup = setupMetricsCleanup();

interface AuctionToProcess {
	id: string;
	listing_id: string;
	title: string;
	end_at: string;
	status: string;
}

serve(async (req) => {
	const logger = createLogger('process_expired_auctions', {
		requestId: crypto.randomUUID()
	});

	try {
		logger.info('Starting expired auctions processing');

		// Get all auctions that have expired but haven't been processed
		const now = new Date().toISOString();
		const { data: expiredAuctions, error: auctionError } = await measureTime(
			logger,
			'fetch_expired_auctions',
			async () => {
				return await RetryOperations.database(
					'fetch_expired_auctions',
					async () => {
						return await supabase
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
					},
					logger,
					{ timestamp: now }
				);
			}
		);

		if (auctionError) {
			logger.error('Failed to fetch expired auctions', auctionError);
			Metrics.errorOccurred('fetch_expired_auctions', auctionError);
			return new Response(
				JSON.stringify({ 
					error: 'Failed to fetch expired auctions',
					requestId: logger.getRequestId()
				}),
				{ status: 500 }
			);
		}

		const auctions = expiredAuctions as AuctionToProcess[];
		logger.info(`Found ${auctions.length} expired auctions to process`, {
			auction_count: auctions.length
		});
		logger.counter('expired_auctions_found', auctions.length);

		const results = [];
		const errors = [];

		// Process each expired auction
		for (const auction of auctions) {
			const auctionLogger = logger.child({ auctionId: auction.id, listingId: auction.listing_id });
			
			try {
				auctionLogger.info('Processing expired auction', {
					title: auction.listings.title
				});

				// Call the database function to end the auction
				const { data: endResult, error: endError } = await measureTime(
					auctionLogger,
					'end_auction_rpc',
					async () => {
						return await RetryOperations.critical(
							'end_auction_rpc',
							async () => {
								return await supabase.rpc('end_auction', {
									auction_id: auction.id
								});
							},
							auctionLogger,
							{ auctionId: auction.id, title: auction.listings.title }
						);
					}
				);

				if (endError) {
					auctionLogger.error('Error ending auction', endError);
					errors.push({
						auction_id: auction.id,
						title: auction.listings.title,
						error: endError.message
					});
					Metrics.errorOccurred('end_auction_rpc', endError, { auctionId: auction.id });
				} else {
					auctionLogger.info('Successfully processed auction', {
						result: endResult
					});
					results.push({
						auction_id: auction.id,
						title: auction.listings.title,
						result: endResult
					});
					Metrics.auctionProcessed(auction.id, true, 0); // Duration tracked by measureTime
				}

				// Small delay between auctions to avoid overwhelming the database
				await new Promise(resolve => setTimeout(resolve, 100));

			} catch (error) {
				auctionLogger.error('Exception processing auction', error as Error);
				errors.push({
					auction_id: auction.id,
					title: auction.listings.title,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
				Metrics.errorOccurred('process_auction', error as Error, { auctionId: auction.id });
			}
		}

		// Log summary
		const summary = {
			total_processed: auctions.length,
			successful: results.length,
			failed: errors.length,
			timestamp: new Date().toISOString(),
			requestId: logger.getRequestId(),
			results,
			errors
		};

		logger.info('Auction processing complete', {
			total_processed: auctions.length,
			successful: results.length,
			failed: errors.length
		});

		// Log final metrics
		logger.counter('auctions_processed', auctions.length);
		logger.counter('auctions_successful', results.length);
		if (errors.length > 0) {
			logger.counter('auctions_failed', errors.length);
		}

		// Create a log entry for monitoring using the new metrics system
		Metrics.addBusinessMetric({
			event_type: 'auction_processing_complete',
			entity_type: 'batch',
			entity_id: logger.getRequestId(),
			value: auctions.length,
			metadata: summary
		});

		// Function execution metric
		Metrics.functionExecuted('process_expired_auctions', Date.now() - logger['startTime'], true);

		return new Response(
			JSON.stringify(summary),
			{
				headers: { 'Content-Type': 'application/json' },
				status: 200
			}
		);

	} catch (error) {
		logger.error('Auction processing failed', error as Error);
		Metrics.errorOccurred('process_expired_auctions', error as Error);
		Metrics.functionExecuted('process_expired_auctions', Date.now() - logger['startTime'], false);
		
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: new Date().toISOString(),
				requestId: logger.getRequestId()
			}),
			{ status: 500 }
		);
	} finally {
		// Ensure metrics are flushed
		cleanup();
	}
});
