<script lang="ts">
	import { onMount } from 'svelte';
	import { getBidHistory, formatPrice } from '$lib/auctions';
	import { supabase } from '$lib/supabase';
	import { Clock, User, TrendingUp } from 'lucide-svelte';

	export let auctionId: string;

	let bids: any[] = [];
	let loading = true;
	let user: any = null;

	onMount(async () => {
		// Get user session
		const { data: { session } } = await supabase.auth.getSession();
		user = session?.user || null;

		await loadBidHistory();
	});

	async function loadBidHistory() {
		try {
			bids = await getBidHistory(auctionId);
		} catch (err) {
			console.error('Error loading bid history:', err);
		} finally {
			loading = false;
		}
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleString('en-AU', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatBidderName(bid: any): string {
		if (!bid.users) return 'Anonymous';
		if (user && bid.bidder_id === user.id) return 'You';
		return bid.users.legal_name || 'Another bidder';
	}

	function isUserBid(bid: any): boolean {
		return user && bid.bidder_id === user.id;
	}

	function getBidStatus(bid: any, index: number): string {
		if (index === 0) return 'Winning';
		if (isUserBid(bid)) return 'Your bid';
		return 'Outbid';
	}

	function getBidStatusColor(bid: any, index: number): string {
		if (index === 0) return 'text-green-600 bg-green-100';
		if (isUserBid(bid)) return 'text-blue-600 bg-blue-100';
		return 'text-gray-600 bg-gray-100';
	}
</script>

<div class="bg-white rounded-lg shadow-sm border">
	<div class="px-6 py-4 border-b border-gray-200">
		<div class="flex items-center space-x-2">
			<TrendingUp class="w-5 h-5 text-gray-500" />
			<h3 class="text-lg font-medium text-gray-900">Bid History</h3>
		</div>
	</div>

	<div class="p-6">
		{#if loading}
			<div class="flex items-center justify-center py-8">
				<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
			</div>
		{:else if bids.length === 0}
			<div class="text-center py-8">
				<Clock class="w-12 h-12 text-gray-400 mx-auto mb-4" />
				<p class="text-gray-500">No bids yet. Be the first to bid!</p>
			</div>
		{:else}
			<div class="space-y-4">
				{#each bids as bid, index}
					<div class="flex items-center space-x-4 p-4 border rounded-lg" class:bg-green-50={index === 0}>
						<div class="flex-shrink-0">
							<div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
								<User class="w-5 h-5 text-gray-500" />
							</div>
						</div>
						
						<div class="flex-1 min-w-0">
							<div class="flex items-center justify-between">
								<div>
									<p class="font-medium text-gray-900">
										{formatBidderName(bid)}
									</p>
									<div class="flex items-center space-x-2 mt-1">
										<span class="text-sm text-gray-500">
											{formatDate(bid.placed_at)}
										</span>
										<span class="inline-block px-2 py-1 text-xs font-medium rounded {getBidStatusColor(bid, index)}">
											{getBidStatus(bid, index)}
										</span>
									</div>
								</div>
								
								<div class="text-right">
									<p class="text-lg font-bold text-gray-900">
										{formatPrice(bid.amount_cents)}
									</p>
									{#if bid.max_proxy_cents && bid.max_proxy_cents > bid.amount_cents}
										<p class="text-xs text-gray-500">
											Proxy: {formatPrice(bid.max_proxy_cents)}
										</p>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#if bids.length > 0}
		<div class="px-6 py-4 bg-gray-50 border-t border-gray-200">
			<div class="grid grid-cols-2 gap-4 text-sm">
				<div>
					<p class="text-gray-500">Total Bids</p>
					<p class="font-medium text-gray-900">{bids.length}</p>
				</div>
				<div>
					<p class="text-gray-500">Unique Bidders</p>
					<p class="font-medium text-gray-900">
						{new Set(bids.map(b => b.bidder_id)).size}
					</p>
				</div>
			</div>
		</div>
	{/if}
</div>
