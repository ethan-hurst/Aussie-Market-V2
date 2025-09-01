<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { 
		subscribeToAuction, 
		placeBid, 
		getMinimumBid, 
		formatTimeRemaining, 
		formatPrice,
		isAuctionEndingSoon,
		type AuctionUpdate
	} from '$lib/auctions';
	import { 
		Gavel, 
		Clock, 
		DollarSign, 
		AlertTriangle, 
		CheckCircle,
		User,
		TrendingUp
	} from 'lucide-svelte';

	export let auctionId: string;
	export let listingEndAt: string;
	export let currentPriceCents: number = 0;
	export let bidCount: number = 0;
	export let highBidderId: string | null = null;
	export let reserveMet: boolean = false;
	export let reserveCents: number | null = null;

	let user: any = null;
	let loading = false;
	let error = '';
	let success = '';
	let bidAmount = '';
	let maxProxyBid = '';
	let timeRemaining = '';
	let isEndingSoon = false;
	let unsubscribe: (() => void) | null = null;
	let minBidAmount = 0;

	onMount(async () => {
		// Get user session
		const { data: { session } } = await supabase.auth.getSession();
		user = session?.user || null;

		// Get minimum bid amount
		try {
			minBidAmount = await getMinimumBid(auctionId);
		} catch (err) {
			console.error('Error getting minimum bid:', err);
		}

		// Start real-time updates
		unsubscribe = subscribeToAuction(auctionId, handleAuctionUpdate);

		// Start time countdown
		updateTimeRemaining();
		const interval = setInterval(updateTimeRemaining, 1000);

		onDestroy(() => {
			if (unsubscribe) unsubscribe();
			clearInterval(interval);
		});
	});

	function handleAuctionUpdate(update: AuctionUpdate) {
		currentPriceCents = update.current_price_cents;
		highBidderId = update.high_bidder_id;
		bidCount = update.bid_count;
		
		// Update minimum bid amount
		updateMinBidAmount();
		
		// Show success message for new bids
		if (update.bid_count > bidCount) {
			success = 'New bid placed!';
			setTimeout(() => success = '', 3000);
		}
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
		if (!user) {
			error = 'Please sign in to place a bid';
			return;
		}

		if (!bidAmount) {
			error = 'Please enter a bid amount';
			return;
		}

		const amount = parseFloat(bidAmount);
		if (isNaN(amount) || amount <= 0) {
			error = 'Please enter a valid bid amount';
			return;
		}

		const amountCents = Math.round(amount * 100);
		if (amountCents < minBidAmount) {
			error = `Bid must be at least ${formatPrice(minBidAmount)}`;
			return;
		}

		loading = true;
		error = '';
		success = '';

		try {
			const maxProxyCents = maxProxyBid ? Math.round(parseFloat(maxProxyBid) * 100) : null;
			
			await placeBid(auctionId, amountCents, maxProxyCents);
			
			success = 'Bid placed successfully!';
			bidAmount = '';
			maxProxyBid = '';
			
			// Update minimum bid amount
			await updateMinBidAmount();
			
			setTimeout(() => success = '', 3000);
		} catch (err: any) {
			error = err.message || 'Failed to place bid';
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
					<p class="text-sm text-gray-500">
						{bidCount} bid{bidCount !== 1 ? 's' : ''} • 
						{formatBidderName(highBidderId || '')} is winning
					</p>
				</div>
			</div>
			
			<div class="text-right">
				<div class="flex items-center space-x-2">
					<Clock class="w-5 h-5 text-gray-400" />
					<span class="text-sm font-medium" class:text-red-600={isEndingSoon}>
						{timeRemaining}
					</span>
				</div>
				{#if isEndingSoon}
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
				<span class="text-3xl font-bold text-gray-900">
					{formatPrice(currentPriceCents)}
				</span>
			</div>
			
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
			<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
				<p class="text-sm text-red-700">{error}</p>
			</div>
		{/if}

		{#if success}
			<div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
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
						type="number"
						bind:value={bidAmount}
						step="0.01"
						min={(minBidAmount / 100).toFixed(2)}
						placeholder={(minBidAmount / 100).toFixed(2)}
						class="input pl-10 w-full"
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
				disabled={loading || !user}
				class="w-full btn-primary py-3"
			>
				{#if loading}
					<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>
				{:else if !user}
					Sign in to Bid
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
	</div>
</div>
