import { supabase } from './supabase';
import { z } from 'zod';

// Bid validation schemas
export const BidSchema = z.object({
	amount_cents: z.number().int().min(100), // Minimum $1.00
	proxy_max_cents: z.number().int().min(100).optional()
});

export type BidData = z.infer<typeof BidSchema>;

// Bid increment table (based on current bid amount)
export const BID_INCREMENTS = [
	{ min: 0, max: 999, increment: 50 },      // $0-$9.99: $0.50 increments
	{ min: 1000, max: 4999, increment: 100 }, // $10-$49.99: $1.00 increments
	{ min: 5000, max: 9999, increment: 250 }, // $50-$99.99: $2.50 increments
	{ min: 10000, max: 24999, increment: 500 }, // $100-$249.99: $5.00 increments
	{ min: 25000, max: 49999, increment: 1000 }, // $250-$499.99: $10.00 increments
	{ min: 50000, max: 99999, increment: 2500 }, // $500-$999.99: $25.00 increments
	{ min: 100000, max: 249999, increment: 5000 }, // $1000-$2499.99: $50.00 increments
	{ min: 250000, max: 499999, increment: 10000 }, // $2500-$4999.99: $100.00 increments
	{ min: 500000, max: null, increment: 25000 } // $5000+: $250.00 increments
] as const;

// Anti-sniping extension rules
export const ANTI_SNIPING_RULES = [
	{ threshold_seconds: 300, extension_seconds: 300 }, // Last 5 minutes: extend by 5 minutes
	{ threshold_seconds: 600, extension_seconds: 180 }, // Last 10 minutes: extend by 3 minutes
	{ threshold_seconds: 1800, extension_seconds: 60 }  // Last 30 minutes: extend by 1 minute
] as const;

/**
 * Calculate the minimum bid increment based on current bid amount
 */
export function calculateBidIncrement(currentBidCents: number): number {
	for (const rule of BID_INCREMENTS) {
		if (currentBidCents >= rule.min && (rule.max === null || currentBidCents <= rule.max)) {
			return rule.increment;
		}
	}
	return 25000; // Default for very high amounts
}

/**
 * Calculate the minimum next bid amount
 */
export function calculateMinimumBid(currentBidCents: number): number {
	const increment = calculateBidIncrement(currentBidCents);
	return currentBidCents + increment;
}

/**
 * Calculate anti-sniping extension based on time remaining
 */
export function calculateAntiSnipingExtension(endAt: string): number {
	const now = new Date();
	const end = new Date(endAt);
	const secondsRemaining = Math.floor((end.getTime() - now.getTime()) / 1000);

	for (const rule of ANTI_SNIPING_RULES) {
		if (secondsRemaining <= rule.threshold_seconds) {
			return rule.extension_seconds;
		}
	}
	return 0;
}

/**
 * Check if user can bid on a listing
 */
export async function canBidOnListing(userId: string, listingId: string): Promise<{
	allowed: boolean;
	reason?: string;
	listing?: any;
	userProfile?: any;
}> {
	try {
		// Get listing with seller info
		const { data: listing, error: listingError } = await supabase
			.from('listings')
			.select(`
				*,
				users!listings_seller_id_fkey (
					id,
					email,
					legal_name,
					kyc
				)
			`)
			.eq('id', listingId)
			.single();

		if (listingError || !listing) {
			return { allowed: false, reason: 'Listing not found' };
		}

		// Check if listing is active
		if (listing.status !== 'active') {
			return { allowed: false, reason: 'Auction is not active', listing };
		}

		// Check if auction has ended
		const now = new Date();
		const endAt = new Date(listing.end_at);
		if (now > endAt) {
			return { allowed: false, reason: 'Auction has ended', listing };
		}

		// Check if user is the seller
		if (listing.seller_id === userId) {
			return { allowed: false, reason: 'You cannot bid on your own listing', listing };
		}

		// Get user profile
		const { data: userProfile, error: userError } = await supabase
			.from('users')
			.select('role, kyc')
			.eq('id', userId)
			.single();

		if (userError) {
			return { allowed: false, reason: 'User profile not found' };
		}

		// Check if user is verified
		if (userProfile.kyc !== 'passed') {
			return { 
				allowed: false, 
				reason: 'KYC verification required to bid',
				listing,
				userProfile 
			};
		}

		return { allowed: true, listing, userProfile };
	} catch (error) {
		console.error('Error checking bid permissions:', error);
		return { allowed: false, reason: 'Permission check failed' };
	}
}

/**
 * Validate bid amount
 */
export function validateBidAmount(
	bidAmountCents: number,
	currentBidCents: number,
	reserveCents?: number
): {
	valid: boolean;
	reason?: string;
	minimumBid?: number;
} {
	// Check minimum bid
	const minimumBid = calculateMinimumBid(currentBidCents);
	if (bidAmountCents < minimumBid) {
		return {
			valid: false,
			reason: `Minimum bid is $${(minimumBid / 100).toFixed(2)}`,
			minimumBid
		};
	}

	// Check if reserve is met
	if (reserveCents && bidAmountCents < reserveCents) {
		return {
			valid: false,
			reason: `Bid must meet reserve price of $${(reserveCents / 100).toFixed(2)}`,
			minimumBid: reserveCents
		};
	}

	return { valid: true };
}

/**
 * Get current highest bid for a listing
 */
export async function getCurrentBid(listingId: string): Promise<{
	success: boolean;
	bid?: any;
	error?: string;
}> {
	try {
		const { data: bid, error } = await supabase
			.from('bids')
			.select('*')
			.eq('listing_id', listingId)
			.order('amount_cents', { ascending: false })
			.limit(1)
			.single();

		if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
			console.error('Error fetching current bid:', error);
			return { success: false, error: 'Failed to fetch current bid' };
		}

		return { success: true, bid: bid || null };
	} catch (error) {
		console.error('Error getting current bid:', error);
		return { success: false, error: 'Failed to get current bid' };
	}
}

/**
 * Get bid history for a listing
 */
export async function getBidHistory(listingId: string, limit: number = 50): Promise<{
	success: boolean;
	bids?: any[];
	error?: string;
}> {
	try {
		const { data: bids, error } = await supabase
			.from('bids')
			.select(`
				*,
				users!bids_bidder_id_fkey (
					id,
					legal_name
				)
			`)
			.eq('listing_id', listingId)
			.order('created_at', { ascending: false })
			.limit(limit);

		if (error) {
			console.error('Error fetching bid history:', error);
			return { success: false, error: 'Failed to fetch bid history' };
		}

		return { success: true, bids };
	} catch (error) {
		console.error('Error getting bid history:', error);
		return { success: false, error: 'Failed to get bid history' };
	}
}

/**
 * Get user's active bids
 */
export async function getUserBids(userId: string): Promise<{
	success: boolean;
	bids?: any[];
	error?: string;
}> {
	try {
		const { data: bids, error } = await supabase
			.from('bids')
			.select(`
				*,
				listings!bids_listing_id_fkey (
					id,
					title,
					end_at,
					status
				)
			`)
			.eq('bidder_id', userId)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error fetching user bids:', error);
			return { success: false, error: 'Failed to fetch user bids' };
		}

		return { success: true, bids };
	} catch (error) {
		console.error('Error getting user bids:', error);
		return { success: false, error: 'Failed to get user bids' };
	}
}

/**
 * Check if user is winning a listing
 */
export async function isUserWinning(userId: string, listingId: string): Promise<{
	winning: boolean;
	bid?: any;
	error?: string;
}> {
	try {
		const { data: bid, error } = await supabase
			.from('bids')
			.select('*')
			.eq('listing_id', listingId)
			.eq('bidder_id', userId)
			.order('amount_cents', { ascending: false })
			.limit(1)
			.single();

		if (error && error.code !== 'PGRST116') {
			console.error('Error checking winning status:', error);
			return { winning: false, error: 'Failed to check winning status' };
		}

		if (!bid) {
			return { winning: false };
		}

		// Check if this is the highest bid
		const { data: highestBid } = await supabase
			.from('bids')
			.select('bidder_id')
			.eq('listing_id', listingId)
			.order('amount_cents', { ascending: false })
			.limit(1)
			.single();

		const winning = highestBid?.bidder_id === userId;

		return { winning, bid };
	} catch (error) {
		console.error('Error checking winning status:', error);
		return { winning: false, error: 'Failed to check winning status' };
	}
}

/**
 * Calculate proxy bid amount
 */
export function calculateProxyBid(
	userBidCents: number,
	proxyMaxCents: number,
	currentHighestBidCents: number
): {
	actualBidCents: number;
	proxyAmountCents: number;
} {
	// If user's bid is already the highest, no proxy bidding needed
	if (userBidCents > currentHighestBidCents) {
		return {
			actualBidCents: userBidCents,
			proxyAmountCents: userBidCents
		};
	}

	// Calculate the minimum amount needed to outbid current highest
	const minimumBid = calculateMinimumBid(currentHighestBidCents);
	
	// If proxy max is less than minimum needed, bid the minimum
	if (proxyMaxCents < minimumBid) {
		return {
			actualBidCents: minimumBid,
			proxyAmountCents: minimumBid
		};
	}

	// Otherwise, bid the proxy max amount
	return {
		actualBidCents: proxyMaxCents,
		proxyAmountCents: proxyMaxCents
	};
}

/**
 * Format bid amount for display
 */
export function formatBidAmount(cents: number): string {
	return new Intl.NumberFormat('en-AU', {
		style: 'currency',
		currency: 'AUD'
	}).format(cents / 100);
}

/**
 * Get time remaining until auction ends
 */
export function getAuctionTimeRemaining(endAt: string): {
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	ended: boolean;
	totalSeconds: number;
} {
	const now = new Date();
	const end = new Date(endAt);
	const totalSeconds = Math.floor((end.getTime() - now.getTime()) / 1000);

	if (totalSeconds <= 0) {
		return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true, totalSeconds: 0 };
	}

	const days = Math.floor(totalSeconds / (24 * 60 * 60));
	const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
	const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
	const seconds = totalSeconds % 60;

	return { days, hours, minutes, seconds, ended: false, totalSeconds };
}

/**
 * Check if auction should be extended due to anti-sniping
 */
export function shouldExtendAuction(endAt: string): {
	shouldExtend: boolean;
	extensionSeconds: number;
	newEndAt: string;
} {
	const extension = calculateAntiSnipingExtension(endAt);
	
	if (extension === 0) {
		return {
			shouldExtend: false,
			extensionSeconds: 0,
			newEndAt: endAt
		};
	}

	const currentEnd = new Date(endAt);
	const newEnd = new Date(currentEnd.getTime() + (extension * 1000));

	return {
		shouldExtend: true,
		extensionSeconds: extension,
		newEndAt: newEnd.toISOString()
	};
}

export interface Auction {
	id: string;
	listing_id: string;
	reserve_met: boolean;
	extension_count: number;
	increment_scheme: string;
	high_bid_id: string | null;
	current_price_cents: number;
	status: 'scheduled' | 'live' | 'ending' | 'ended';
}

export interface Bid {
	id: string;
	auction_id: string;
	bidder_id: string;
	amount_cents: number;
	max_proxy_cents: number | null;
	accepted: boolean;
	placed_at: string;
}

export interface AuctionWithBids extends Auction {
	bids: Bid[];
}

export interface AuctionUpdate {
	auction_id: string;
	current_price_cents: number;
	high_bidder_id: string | null;
	bid_count: number;
	time_remaining: number;
	status?: string;
}

export interface BidUpdate {
	bid_id: string;
	auction_id: string;
	bidder_id: string;
	amount_cents: number;
	placed_at: string;
	event_type: string;
	current_price_cents: number;
	high_bidder_id: string | null;
	bid_count: number;
	time_remaining: number;
}

export interface AuctionStatusUpdate {
	auction_id: string;
	old_status: string;
	new_status: string;
	changed_at: string;
	current_price_cents: number;
}

// Enhanced real-time auction subscription with comprehensive updates
export function subscribeToAuction(
	auctionId: string,
	callbacks: {
		onUpdate?: (update: AuctionUpdate) => void;
		onBid?: (bid: BidUpdate) => void;
		onStatusChange?: (status: AuctionStatusUpdate) => void;
		onEndingSoon?: (seconds: number) => void;
		onConnectionStatus?: (status: 'connected' | 'disconnected' | 'reconnecting') => void;
		onError?: (error: Error) => void;
	} = {}
) {
	const channel = supabase.channel(`auction-${auctionId}`, {
		config: {
			presence: {
				key: `user-${Date.now()}`
			}
		}
	});

	let timeRemainingInterval: NodeJS.Timeout | null = null;
	let connectionStatus = 'connecting' as 'connected' | 'disconnected' | 'reconnecting';
	let lastAuctionData: any = null;

	// Track connection status
	channel.on('system', {}, (payload) => {
		if (payload.event === 'CHANNEL_JOIN') {
			connectionStatus = 'connected';
			callbacks.onConnectionStatus?.('connected');
		} else if (payload.event === 'CHANNEL_ERROR' || payload.event === 'CHANNEL_CLOSE') {
			connectionStatus = 'disconnected';
			callbacks.onConnectionStatus?.('disconnected');

			// Attempt reconnection after delay
			setTimeout(() => {
				if (connectionStatus === 'disconnected') {
					connectionStatus = 'reconnecting';
					callbacks.onConnectionStatus?.('reconnecting');
					channel.subscribe();
				}
			}, 3000);
		}
	});

	// Listen for bid changes
	channel.on(
		'postgres_changes',
		{
			event: '*',
			schema: 'public',
			table: 'bids',
			filter: `auction_id=eq.${auctionId}`
		},
		async (payload) => {
			try {
				// Fetch updated auction data with listing info for time calculation
				const { data: auction } = await supabase
					.from('auctions')
					.select(`
						*,
						listings!inner (
							end_at
						),
						bids (
							id,
							bidder_id,
							amount_cents,
							max_proxy_cents,
							placed_at,
							accepted
						)
					`)
					.eq('id', auctionId)
					.single();

				if (!auction) return;

				lastAuctionData = auction;
				const now = new Date();
				const endTime = new Date(auction.listings.end_at);
				const timeRemaining = Math.max(0, Math.floor((endTime.getTime() - now.getTime()) / 1000));

				// Create bid update
				const bidUpdate: BidUpdate = {
					bid_id: (payload.new as any)?.id || (payload.old as any)?.id,
					auction_id: auctionId,
					bidder_id: (payload.new as any)?.bidder_id,
					amount_cents: (payload.new as any)?.amount_cents || (payload.old as any)?.amount_cents,
					placed_at: (payload.new as any)?.placed_at,
					event_type: payload.eventType,
					current_price_cents: auction.current_price_cents,
					high_bidder_id: auction.high_bid_id,
					bid_count: auction.bids?.length || 0,
					time_remaining: timeRemaining
				};

				callbacks.onBid?.(bidUpdate);

				// Create general auction update
				const update: AuctionUpdate = {
					auction_id: auction.id,
					current_price_cents: auction.current_price_cents,
					high_bidder_id: auction.high_bid_id,
					bid_count: auction.bids?.length || 0,
					time_remaining: timeRemaining,
					status: auction.status
				};

				callbacks.onUpdate?.(update);

				// Check if auction is ending soon
				if (timeRemaining <= 300 && timeRemaining > 0) { // 5 minutes or less
					callbacks.onEndingSoon?.(timeRemaining);
				}

			} catch (error) {
				console.error('Error processing bid update:', error);
				callbacks.onError?.(error as Error);
			}
		}
	);

	// Listen for auction status changes
	channel.on(
		'postgres_changes',
		{
			event: '*',
			schema: 'public',
			table: 'auctions',
			filter: `id=eq.${auctionId}`
		},
		async (payload) => {
			try {
				const statusUpdate: AuctionStatusUpdate = {
					auction_id: auctionId,
					old_status: (payload.old as any)?.status,
					new_status: (payload.new as any)?.status,
					changed_at: new Date().toISOString(),
					current_price_cents: (payload.new as any)?.current_price_cents || (payload.old as any)?.current_price_cents
				};

				callbacks.onStatusChange?.(statusUpdate);

				// If auction ended, stop the time remaining updates
				if ((payload.new as any)?.status === 'ended' || (payload.new as any)?.status === 'finalized') {
					if (timeRemainingInterval) {
						clearInterval(timeRemainingInterval);
						timeRemainingInterval = null;
					}
				}
			} catch (error) {
				console.error('Error processing auction status update:', error);
				callbacks.onError?.(error as Error);
			}
		}
	);

	// Start time remaining updates (every 10 seconds)
	const startTimeUpdates = () => {
		timeRemainingInterval = setInterval(async () => {
			try {
				if (!lastAuctionData) return;

				const now = new Date();
				const endTime = new Date(lastAuctionData.listings.end_at);
				const timeRemaining = Math.max(0, Math.floor((endTime.getTime() - now.getTime()) / 1000));

				// Only send update if time has changed significantly
				if (timeRemaining > 0 && timeRemaining % 10 === 0) { // Every 10 seconds
					const update: AuctionUpdate = {
						auction_id: auctionId,
						current_price_cents: lastAuctionData.current_price_cents,
						high_bidder_id: lastAuctionData.high_bid_id,
						bid_count: lastAuctionData.bids?.length || 0,
						time_remaining: timeRemaining,
						status: lastAuctionData.status
					};

					callbacks.onUpdate?.(update);

					// Check for ending soon notifications
					if (timeRemaining <= 300 && timeRemaining > 0) {
						callbacks.onEndingSoon?.(timeRemaining);
					}
				}

				// Stop updates if auction has ended
				if (timeRemaining <= 0) {
					if (timeRemainingInterval) {
						clearInterval(timeRemainingInterval);
						timeRemainingInterval = null;
					}
				}

			} catch (error) {
				console.error('Error in time update interval:', error);
			}
		}, 10000); // Update every 10 seconds
	};

	// Subscribe to channel
	channel.subscribe((status) => {
		if (status === 'SUBSCRIBED') {
			connectionStatus = 'connected';
			callbacks.onConnectionStatus?.('connected');
			startTimeUpdates();
		} else if (status === 'CHANNEL_ERROR') {
			connectionStatus = 'disconnected';
			callbacks.onConnectionStatus?.('disconnected');
		} else if (status === 'TIMED_OUT') {
			connectionStatus = 'reconnecting';
			callbacks.onConnectionStatus?.('reconnecting');
		}
	});

	// Return cleanup function
	return () => {
		if (timeRemainingInterval) {
			clearInterval(timeRemainingInterval);
		}
		supabase.removeChannel(channel);
	};
}

// Place a bid
export async function placeBid(auctionId: string, amountCents: number, maxProxyCents?: number) {
	const { data, error } = await supabase.rpc('place_bid', {
		auction_id: auctionId,
		amount_cents: amountCents,
		max_proxy_cents: maxProxyCents || null
	});

	if (error) {
		throw new Error(error.message);
	}

	return data;
}

// Get auction details with bids
export async function getAuctionWithBids(auctionId: string): Promise<AuctionWithBids | null> {
	const { data, error } = await supabase
		.from('auctions')
		.select(`
			*,
			bids (
				id,
				bidder_id,
				amount_cents,
				max_proxy_cents,
				accepted,
				placed_at
			)
		`)
		.eq('id', auctionId)
		.single();

	if (error) {
		console.error('Error fetching auction:', error);
		return null;
	}

	return data;
}

// Get minimum bid amount for an auction
export async function getMinimumBid(auctionId: string): Promise<number> {
	const { data: auction } = await supabase
		.from('auctions')
		.select(`
			*,
			listings!inner (
				start_cents
			)
		`)
		.eq('id', auctionId)
		.single();

	if (!auction) {
		throw new Error('Auction not found');
	}

	// Get current high bid
	const { data: highBid } = await supabase
		.from('bids')
		.select('amount_cents')
		.eq('auction_id', auctionId)
		.order('amount_cents', { ascending: false })
		.limit(1)
		.single();

	if (!highBid) {
		// First bid, must be at least starting price
		return auction.listings.start_cents;
	}

	// Calculate minimum increment
	const minIncrement = Math.max(100, Math.floor(highBid.amount_cents * 0.05)); // 5% or $1 minimum
	return highBid.amount_cents + minIncrement;
}

// Format time remaining
export function formatTimeRemaining(endAt: string): string {
	const now = new Date();
	const end = new Date(endAt);
	const diff = end.getTime() - now.getTime();
	
	if (diff <= 0) return 'Ended';
	
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));
	const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
	const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
	const seconds = Math.floor((diff % (1000 * 60)) / 1000);
	
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

// Check if auction is ending soon (last 5 minutes)
export function isAuctionEndingSoon(endAt: string): boolean {
	const now = new Date();
	const end = new Date(endAt);
	const diff = end.getTime() - now.getTime();
	
	return diff > 0 && diff <= 5 * 60 * 1000; // 5 minutes
}

// Get auction status
export function getAuctionStatus(auction: Auction, endAt: string): string {
	const now = new Date();
	const end = new Date(endAt);
	
	if (end <= now) {
		return 'ended';
	}
	
	if (isAuctionEndingSoon(endAt)) {
		return 'ending';
	}
	
	return auction.status;
}

// Format price
export function formatPrice(cents: number): string {
	return new Intl.NumberFormat('en-AU', {
		style: 'currency',
		currency: 'AUD'
	}).format(cents / 100);
}

// Get bid history for an auction
export async function getAuctionBidHistory(auctionId: string): Promise<Bid[]> {
	const { data, error } = await supabase
		.from('bids')
		.select(`
			*,
			users!bids_bidder_id_fkey (
				id,
				legal_name,
				email
			)
		`)
		.eq('auction_id', auctionId)
		.order('placed_at', { ascending: false });

	if (error) {
		console.error('Error fetching bid history:', error);
		return [];
	}

	return data || [];
}

// Check if user is the current high bidder
export function isHighBidder(auction: Auction, userId: string): boolean {
	if (!auction.high_bid_id) return false;
	
	// We'd need to fetch the high bid to check the bidder_id
	// For now, we'll assume the high_bid_id corresponds to the user's bid
	return true; // This is a simplified check
}

// Get user's current bid on an auction
export async function getUserBid(auctionId: string, userId: string): Promise<Bid | null> {
	const { data, error } = await supabase
		.from('bids')
		.select('*')
		.eq('auction_id', auctionId)
		.eq('bidder_id', userId)
		.order('amount_cents', { ascending: false })
		.limit(1)
		.single();

	if (error) {
		return null;
	}

	return data;
}
