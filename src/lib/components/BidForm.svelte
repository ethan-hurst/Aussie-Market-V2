<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { 
		calculateMinimumBid, 
		formatBidAmount, 
		validateBidAmount,
		type BidData
	} from '$lib/auctions';
import { toastError, toastSuccess } from '$lib/toast';
	import { DollarSign, Clock, AlertCircle, CheckCircle, Zap } from 'lucide-svelte';

	export let listing: any;
	export let currentBid: any = null;
	export let user: any = null;
	export let disabled = false;

	const dispatch = createEventDispatcher<{
		bid: { bidData: BidData; success: boolean; error?: string };
	}>();

	let bidAmount = '';
	let proxyMaxAmount = '';
	let useProxyBidding = false;
	let submitting = false;
	let error = '';
	let success = '';

	// Calculate minimum bid amount
	$: minimumBidCents = currentBid 
		? calculateMinimumBid(currentBid.amount_cents)
		: listing.start_cents;
	
	$: minimumBidDisplay = formatBidAmount(minimumBidCents);
	$: currentBidDisplay = currentBid ? formatBidAmount(currentBid.amount_cents) : 'No bids yet';

	// Validate bid amount
	$: bidValidation = bidAmount ? validateBidAmount(
		parseInt(bidAmount) * 100,
		currentBid?.amount_cents || 0,
		listing.reserve_cents
	) : null;

	// Calculate proxy bid suggestion
	$: proxySuggestion = useProxyBidding && bidAmount 
		? Math.ceil(parseInt(bidAmount) * 1.1) // 10% above current bid
		: 0;

	function handleSubmit() {
		submitting = true;
		error = '';
		success = '';

		try {
			const bidData: BidData = {
				amount_cents: parseInt(bidAmount) * 100,
				proxy_max_cents: useProxyBidding && proxyMaxAmount 
					? parseInt(proxyMaxAmount) * 100 
					: undefined
			};

			// Validate bid data
			if (!bidValidation?.valid) {
				error = bidValidation?.reason || 'Invalid bid amount';
				toastError(error);
				submitting = false;
				return;
			}

			// Dispatch bid event
			dispatch('bid', { bidData, success: true });
			toastSuccess('Bid submitted');

		} catch (err) {
			error = 'Failed to process bid';
			toastError(error);
			console.error('Bid submission error:', err);
		} finally {
			submitting = false;
		}
	}

	function setMinimumBid() {
		bidAmount = (minimumBidCents / 100).toString();
	}

	function setProxySuggestion() {
		if (proxySuggestion > 0) {
			proxyMaxAmount = proxySuggestion.toString();
		}
	}

	// Auto-set proxy suggestion when proxy bidding is enabled
	$: if (useProxyBidding && proxySuggestion > 0 && !proxyMaxAmount) {
		setProxySuggestion();
	}
</script>

<div class="space-y-6">
	<!-- Current Bid Display -->
	<div class="bg-gray-50 rounded-lg p-4">
		<div class="flex items-center justify-between">
			<div>
				<p class="text-sm text-gray-600">Current Bid</p>
				<p class="text-2xl font-bold text-gray-900">{currentBidDisplay}</p>
			</div>
			<div class="text-right">
				<p class="text-sm text-gray-600">Minimum Next Bid</p>
				<p class="text-lg font-semibold text-primary-600">{minimumBidDisplay}</p>
			</div>
		</div>
	</div>

	<!-- Bid Form -->
	<form on:submit|preventDefault={handleSubmit} class="space-y-4">
		<!-- Bid Amount -->
		<div>
			<label for="bidAmount" class="block text-sm font-medium text-gray-700 mb-2">
				Your Bid Amount (AUD)
			</label>
			<div class="relative">
				<DollarSign class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
				<input
					id="bidAmount"
					type="number"
					bind:value={bidAmount}
					min={(minimumBidCents / 100).toString()}
					step="0.01"
					required
					disabled={disabled || submitting}
					class="input pl-10 {bidValidation && !bidValidation.valid ? 'border-red-300' : ''}"
					placeholder="Enter your bid amount"
				/>
			</div>
			<div class="flex items-center justify-between mt-2">
				<button
					type="button"
					on:click={setMinimumBid}
					class="text-sm text-primary-600 hover:text-primary-700"
				>
					Bid minimum ({minimumBidDisplay})
				</button>
				{#if bidValidation}
					{#if bidValidation.valid}
						<div class="flex items-center text-green-600">
							<CheckCircle class="w-4 h-4 mr-1" />
							<span class="text-sm">Valid bid</span>
						</div>
					{:else}
						<div class="flex items-center text-red-600">
							<AlertCircle class="w-4 h-4 mr-1" />
							<span class="text-sm">{bidValidation.reason}</span>
						</div>
					{/if}
				{/if}
			</div>
		</div>

		<!-- Proxy Bidding -->
		<div class="space-y-3">
			<div class="flex items-center">
				<input
					id="useProxy"
					type="checkbox"
					bind:checked={useProxyBidding}
					disabled={disabled || submitting}
					class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
				/>
				<label for="useProxy" class="ml-2 flex items-center text-sm text-gray-900">
					<Zap class="w-4 h-4 mr-2" />
					Use proxy bidding
				</label>
			</div>
			
			{#if useProxyBidding}
				<div class="ml-6 space-y-3">
					<p class="text-sm text-gray-600">
						Proxy bidding automatically increases your bid up to your maximum to keep you winning.
					</p>
					
					<div>
						<label for="proxyMax" class="block text-sm font-medium text-gray-700 mb-2">
							Maximum Bid Amount (AUD)
						</label>
						<div class="relative">
							<DollarSign class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
							<input
								id="proxyMax"
								type="number"
								bind:value={proxyMaxAmount}
								min={bidAmount || '0'}
								step="0.01"
								disabled={disabled || submitting}
								class="input pl-10"
								placeholder="Enter maximum bid amount"
							/>
						</div>
						{#if proxySuggestion > 0}
							<button
								type="button"
								on:click={setProxySuggestion}
								class="text-sm text-primary-600 hover:text-primary-700 mt-1"
							>
								Suggest ${proxySuggestion} (10% above current bid)
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Reserve Price Warning -->
		{#if listing.reserve_cents && (!currentBid || currentBid.amount_cents < listing.reserve_cents)}
			<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
				<div class="flex items-center">
					<AlertCircle class="w-5 h-5 text-yellow-400 mr-2" />
					<div>
						<p class="text-sm font-medium text-yellow-800">
							Reserve Price Not Met
						</p>
						<p class="text-sm text-yellow-700">
							This item has a reserve price of {formatBidAmount(listing.reserve_cents)}. 
							The auction will only end if the reserve is met.
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Error/Success Messages -->
		{#if error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
				{error}
			</div>
		{/if}

		{#if success}
			<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
				{success}
			</div>
		{/if}

		<!-- Submit Button -->
		<button
			type="submit"
			disabled={disabled || submitting || (bidValidation && !bidValidation.valid)}
			class="w-full btn-primary btn-lg"
		>
			{submitting ? 'Placing Bid...' : 'Place Bid'}
		</button>
	</form>

	<!-- Auction Info -->
	<div class="border-t pt-4">
		<div class="flex items-center justify-between text-sm text-gray-600">
			<div class="flex items-center">
				<Clock class="w-4 h-4 mr-1" />
				<span>Ends {new Date(listing.end_at).toLocaleDateString()}</span>
			</div>
			<div>
				<span>{listing.bid_count || 0} bids</span>
			</div>
		</div>
	</div>
</div>
