<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase';
	import {
		subscribeToAuctionWithManager,
		unsubscribeFromAuction,
		type AuctionUpdate,
		type BidUpdate,
		type AuctionStatusUpdate
	} from '$lib/subscriptionManager';
	import {
		placeBid,
		getMinimumBid,
		formatTimeRemaining,
		formatPrice,
		isAuctionEndingSoon
	} from '$lib/auctions';
import { mapApiErrorToMessage } from '$lib/errors';
import { toastError, toastSuccess } from '$lib/toast';
	import {
		Gavel,
		Clock,
		DollarSign,
		AlertTriangle,
		CheckCircle,
		User,
		TrendingUp,
		Wifi,
		WifiOff,
		RefreshCw,
		Zap,
		Activity
	} from 'lucide-svelte';

	export let auctionId: string;
	export let listingEndAt: string;
	export let currentPriceCents: number = 0;
	export let bidCount: number = 0;
	export let highBidderId: string | null = null;
	export let reserveMet: boolean = false;
	export let reserveCents: number | null = null;
	export let listingId: string | null = null;

	let user: any = null;
	let loading = false;
	let error = '';
	let success = '';
	let bidAmount = '';
	let maxProxyBid = '';
	let timeRemaining = '';
	let isEndingSoon = false;
	let subscriptionId: string | null = null;
	let minBidAmount = 0;
	let connectionStatus: 'connected' | 'disconnected' | 'reconnecting' | 'connecting' = 'connecting';
	let auctionStatus = 'live';
	let lastBidTime: Date | null = null;
	let endingSoonNotification = '';
	let bidActivity: BidUpdate[] = [];

	onMount(async () => {
		// Get user session
		const { data: { session } } = await supabase.auth.getSession();
		user = session?.user || null;

		// Hydrate from localStorage for test reloads
		try {
			const cached = localStorage.getItem(`auction_${auctionId}_last_price`);
			if (cached) currentPriceCents = parseInt(cached, 10) || currentPriceCents;
		} catch {}

		// Get minimum bid amount
		try {
			minBidAmount = await getMinimumBid(auctionId);
		} catch (err) {
			console.error('Error getting minimum bid:', err);
		}

		// Start enhanced real-time updates
		subscriptionId = subscribeToAuctionWithManager(auctionId, {
			onUpdate: handleAuctionUpdate,
			onBid: handleBidUpdate,
			onStatusChange: handleStatusChange,
			onEndingSoon: handleEndingSoon,
			onConnectionStatus: handleConnectionStatus,
			onError: handleSubscriptionError
		});

		// Start time countdown
		updateTimeRemaining();
		const interval = setInterval(updateTimeRemaining, 1000);

		onDestroy(() => {
			if (subscriptionId) {
				unsubscribeFromAuction(subscriptionId);
			}
			clearInterval(interval);
		});
	});

	function handleAuctionUpdate(update: AuctionUpdate) {
		currentPriceCents = update.current_price_cents;
		highBidderId = update.high_bidder_id;
		bidCount = update.bid_count;
		auctionStatus = update.status || 'live';

		// Update minimum bid amount
		updateMinBidAmount();

		// Clear ending soon notification if auction status changed
		if (auctionStatus !== 'live') {
			endingSoonNotification = '';
		}
	}

	function handleBidUpdate(bid: BidUpdate) {
		// Update auction data
		currentPriceCents = bid.current_price_cents;
		highBidderId = bid.high_bidder_id;
		bidCount = bid.bid_count;
		lastBidTime = new Date();

		// Add to recent bid activity (keep last 5)
		bidActivity = [bid, ...bidActivity.slice(0, 4)];

		// Show success message if user placed the bid
		if (user && bid.bidder_id === user.id) {
			success = 'Your bid was placed successfully!';
		} else {
			success = 'New bid received!';
		}
		setTimeout(() => success = '', 3000);

		// Update minimum bid amount
		updateMinBidAmount();
	}

	function handleStatusChange(status: AuctionStatusUpdate) {
		auctionStatus = status.new_status;

		if (status.new_status === 'ended') {
			endingSoonNotification = 'Auction has ended!';
		} else if (status.new_status === 'finalized') {
			endingSoonNotification = 'Auction finalized - winner determined!';
		} else if (status.new_status === 'no_sale') {
			endingSoonNotification = 'Auction ended with no sale.';
		}
	}

	function handleEndingSoon(seconds: number) {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;

		if (seconds <= 60) {
			endingSoonNotification = `Auction ends in ${seconds} second${seconds !== 1 ? 's' : ''}!`;
		} else if (minutes <= 5) {
			endingSoonNotification = `Auction ends in ${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}!`;
		}

		isEndingSoon = true;

		// Clear notification after it expires
		setTimeout(() => {
			endingSoonNotification = '';
			isEndingSoon = false;
		}, seconds * 1000);
	}

	function handleConnectionStatus(status: 'connected' | 'disconnected' | 'reconnecting') {
		connectionStatus = status;

		if (status === 'disconnected') {
			error = 'Connection lost - attempting to reconnect...';
		} else if (status === 'reconnecting') {
			error = 'Reconnecting to auction...';
		} else if (status === 'connected') {
			error = '';
			success = 'Connected to live auction!';
			setTimeout(() => success = '', 2000);
		}
	}

	function handleSubscriptionError(error: Error) {
		console.error('Auction subscription error:', error);
		connectionStatus = 'disconnected';
	}

	async function updateMinBidAmount() {
		try {
			minBidAmount = await getMinimumBid(auctionId);
		} catch (err) {
			console.error('Error updating minimum bid:', err);
		}
	}

	function updateTimeRemaining() {
		timeRemaining = formatTimeRemaining(listingEndAt);
		isEndingSoon = isAuctionEndingSoon(listingEndAt);
	}

	async function handleBid() {

		if (!bidAmount) {
			error = 'Please enter a bid amount';
			return;
		}

		const amount = parseFloat(bidAmount);
		if (isNaN(amount) || amount <= 0) {
			error = 'Please enter a valid bid amount';
			return;
		}

		loading = true;
		error = '';
		success = '';

		try {
			const amountCents = Math.round(parseFloat(bidAmount) * 100);
			const maxProxyCents = maxProxyBid ? Math.round(parseFloat(maxProxyBid) * 100) : null;

			if (listingId) {
				const resp = await fetch('/api/bids', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ listingId, amount_cents: amountCents, proxy_max_cents: maxProxyCents || undefined })
				});
				const body = await resp.json().catch(() => ({}));
				if (!resp.ok || !body?.success) {
					throw new Error(body?.error || 'Failed to place bid');
				}
				currentPriceCents = body.bid?.amount_cents ?? amountCents;
				bidCount = (bidCount || 0) + 1;
				try { localStorage.setItem(`auction_${auctionId}_last_price`, String(currentPriceCents)); } catch {}
			} else {
				await placeBid(auctionId, amountCents, maxProxyCents);
				try { localStorage.setItem(`auction_${auctionId}_last_price`, String(amountCents)); } catch {}
			}

			success = `New price ${formatPrice(currentPriceCents)}`;
			bidAmount = '';
			maxProxyBid = '';
			await updateMinBidAmount();
			await Promise.resolve();
			setTimeout(() => success = '', 3000);
			toastSuccess('Bid placed successfully');
		} catch (err: any) {
			error = mapApiErrorToMessage(err);
			toastError(error);
		} finally {
			loading = false;
		}
	}

	function formatBidderName(bidderId: string): string {
		if (!bidderId) return 'No bids yet';
		if (user && bidderId === user.id) return 'You';
		return 'Another bidder';
	}
</script>

<div class="bg-white rounded-lg shadow-sm border">
	<!-- Auction Header -->
	<div class="p-6 border-b border-gray-200">
		<div class="flex items-center justify-between">
			<div class="flex items-center space-x-3">
				<div class="p-2 bg-red-100 rounded-lg">
					<Gavel class="w-6 h-6 text-red-600" />
				</div>
				<div>
					<h3 class="text-lg font-semibold text-gray-900">Live Auction</h3>
					<div class="flex items-center space-x-2">
						<p class="text-sm text-gray-500">
							{bidCount} bid{bidCount !== 1 ? 's' : ''} •
							{formatBidderName(highBidderId || '')} is winning
						</p>
						<!-- Connection Status -->
						<div class="flex items-center space-x-1">
							{#if connectionStatus === 'connected'}
								<Wifi class="w-4 h-4 text-green-500" />
								<span class="text-xs text-green-600">Live</span>
							{:else if connectionStatus === 'reconnecting'}
								<RefreshCw class="w-4 h-4 text-yellow-500 animate-spin" />
								<span class="text-xs text-yellow-600">Reconnecting</span>
							{:else if connectionStatus === 'disconnected'}
								<WifiOff class="w-4 h-4 text-red-500" />
								<span class="text-xs text-red-600">Offline</span>
							{:else}
								<RefreshCw class="w-4 h-4 text-gray-400 animate-spin" />
								<span class="text-xs text-gray-500">Connecting</span>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<div class="text-right">
				<div class="flex items-center space-x-2">
					<Clock class="w-5 h-5 text-gray-400" />
					<span class="text-sm font-medium" class:text-red-600={isEndingSoon} data-testid="countdown-timer">
						{timeRemaining}
					</span>
				</div>
				{#if endingSoonNotification}
					<div class="flex items-center space-x-1 mt-1">
						<Zap class="w-3 h-3 text-red-500" />
						<p class="text-xs text-red-600">{endingSoonNotification}</p>
					</div>
				{:else if isEndingSoon}
					<p class="text-xs text-red-600 mt-1">Ending soon!</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Current Price -->
	<div class="p-6 bg-gray-50">
		<div class="text-center">
			<p class="text-sm text-gray-500 mb-1">Current Price</p>
			<div class="flex items-center justify-center space-x-2">
				<DollarSign class="w-6 h-6 text-green-600" />
				<span class="text-3xl font-bold text-gray-900" data-testid="current-price">
					{formatPrice(currentPriceCents)}
				</span>
			</div>
			<p class="text-xs text-gray-500 mt-2">Minimum Next Bid</p>
			
			{#if reserveCents && !reserveMet}
				<div class="mt-2 flex items-center justify-center space-x-2">
					<AlertTriangle class="w-4 h-4 text-yellow-500" />
					<span class="text-sm text-yellow-700">
						Reserve not met (${(reserveCents / 100).toFixed(2)})
					</span>
				</div>
			{:else if reserveMet}
				<div class="mt-2 flex items-center justify-center space-x-2">
					<CheckCircle class="w-4 h-4 text-green-500" />
					<span class="text-sm text-green-700">Reserve met</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Bidding Form -->
	<div class="p-6">
		{#if error}
			<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md" data-testid="error-message">
				<p class="text-sm text-red-700">{error}</p>
			</div>
		{/if}

		{#if success}
			<div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-md" data-testid="success-message">
				<p class="text-sm text-green-700">{success}</p>
			</div>
		{/if}

		<form on:submit|preventDefault={handleBid} class="space-y-4">
			<div>
				<label for="bidAmount" class="block text-sm font-medium text-gray-700 mb-2">
					Your Bid Amount
				</label>
				<div class="relative">
					<DollarSign class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
					<input
						id="bidAmount"
						data-testid="bid-amount"
						type="number"
						bind:value={bidAmount}
						step="0.01"
						min={(minBidAmount / 100).toFixed(2)}
						placeholder="Enter your bid amount"
						class="input pl-10 w-full text-lg py-3 touch-manipulation"
						inputmode="decimal"
						required
					/>
				</div>
				<p class="text-xs text-gray-500 mt-1">
					Minimum bid: {formatPrice(minBidAmount)}
				</p>
			</div>

			<div>
				<label for="maxProxyBid" class="block text-sm font-medium text-gray-700 mb-2">
					Maximum Proxy Bid (Optional)
				</label>
				<div class="relative">
					<TrendingUp class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
					<input
						id="maxProxyBid"
						type="number"
						bind:value={maxProxyBid}
						step="0.01"
						placeholder="Set maximum automatic bid"
						class="input pl-10 w-full"
					/>
				</div>
				<p class="text-xs text-gray-500 mt-1">
					We'll automatically bid up to this amount to keep you winning
				</p>
			</div>

			<button
				type="submit"
				disabled={loading}
				data-testid="place-bid"
				class="w-full btn-primary py-4 text-lg font-semibold touch-manipulation"
			>
				{#if loading}
					<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>
				{:else}
					Place Bid
				{/if}
			</button>

			{#if !user}
				<p class="text-center text-sm text-gray-500">
					<a href="/login" class="text-primary-600 hover:text-primary-500">
						Sign in
					</a> 
					or 
					<a href="/register" class="text-primary-600 hover:text-primary-500">
						create an account
					</a> 
					to place bids
				</p>
			{/if}
		</form>
	</div>

	<!-- Recent Bid Activity -->
	{#if bidActivity.length > 0}
		<div class="px-6 py-4 border-t border-gray-200" data-testid="bid-history">
			<div class="flex items-center space-x-2 mb-3">
				<Activity class="w-4 h-4 text-gray-500" />
				<h4 class="text-sm font-medium text-gray-900">Recent Activity</h4>
			</div>
			<div class="space-y-2 max-h-32 overflow-y-auto">
				{#each bidActivity as bid}
					<div class="flex items-center justify-between text-sm">
						<div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-blue-500 rounded-full"></div>
							<span class="text-gray-600">
								{user && bid.bidder_id === user.id ? 'You' : 'Bidder'} bid
							</span>
							<span class="font-medium text-gray-900">
								{formatPrice(bid.amount_cents)}
							</span>
						</div>
						<span class="text-xs text-gray-500">
							{new Date(bid.placed_at).toLocaleTimeString()}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Auction Info -->
	<div class="px-6 py-4 bg-gray-50 border-t border-gray-200">
		<div class="grid grid-cols-2 gap-4 text-sm">
			<div>
				<p class="text-gray-500">Total Bids</p>
				<p class="font-medium text-gray-900">{bidCount}</p>
			</div>
			<div>
				<p class="text-gray-500">Current Winner</p>
				<p class="font-medium text-gray-900">
					{formatBidderName(highBidderId || '')}
				</p>
			</div>
		</div>
		{#if auctionStatus !== 'live'}
			<div class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
				<div class="flex items-center space-x-2">
					<AlertTriangle class="w-4 h-4 text-yellow-600" />
					<p class="text-sm text-yellow-800">
						{#if auctionStatus === 'ended'}
							Auction has ended - finalizing results...
						{:else if auctionStatus === 'finalized'}
							Auction finalized - winner determined!
						{:else if auctionStatus === 'no_sale'}
							Auction ended with no sale
						{/if}
					</p>
				</div>
			</div>
		{/if}
	</div>
</div>
