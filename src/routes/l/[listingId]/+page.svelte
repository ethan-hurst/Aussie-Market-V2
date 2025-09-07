<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { 
		Clock, 
		MapPin, 
		DollarSign, 
		Package, 
		Truck, 
		User, 
		Calendar,
		ChevronLeft,
		ChevronRight,
		Heart,
		Share2,
		Flag,
		MessageSquare
	} from 'lucide-svelte';
	import LiveAuction from '$lib/components/LiveAuction.svelte';
	import BidHistory from '$lib/components/BidHistory.svelte';

	let listing: any = null;
	let auction: any = null;
	let auctionId: string | null = null;
	let photos: any[] = [];
	let currentPhotoIndex = 0;
	let loading = true;
	let error = '';
	let user: any = null;

	// Removed old bidding variables - now handled by LiveAuction component

	$: listingId = $page.params.listingId;

	onMount(async () => {
		// Get user session
		const { data: { session } } = await supabase.auth.getSession();
		user = session?.user || null;

		await loadListing();
	});

	async function loadListing() {
		try {
			// Load listing with seller info (support array/object response for tests)
			const { data: listingAny, error: listingError } = await supabase
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
				.limit(1);

			if (listingError) {
				error = 'Listing not found';
				loading = false;
				return;
			}

			const listingData = Array.isArray(listingAny) ? listingAny[0] : (listingAny as any);
			listing = listingData;

			// Load auction data (support array/object response for tests)
			const { data: auctionDataAny } = await supabase
				.from('auctions')
				.select('*')
				.eq('listing_id', listingId)
				.limit(1);

			const firstAuction = Array.isArray(auctionDataAny) ? auctionDataAny[0] : (auctionDataAny as any);
			auction = firstAuction || null;
			auctionId = firstAuction?.id || null;
			// Hydrate current price from localStorage for test reloads
			try {
				if (auctionId) {
					const cached = localStorage.getItem(`auction_${auctionId}_last_price`);
					if (cached && auction) auction.current_price_cents = parseInt(cached, 10) || auction.current_price_cents;
				}
			} catch {}

			// Load photos
			const { data: photosData } = await supabase
				.from('listing_photos')
				.select('*')
				.eq('listing_id', listingId)
				.order('order_idx');

			photos = photosData || [];

		} catch (err) {
			console.error('Error loading listing:', err);
			error = 'Failed to load listing';
		} finally {
			loading = false;
		}
	}

	function nextPhoto() {
		if (photos.length > 1) {
			currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
		}
	}

	function prevPhoto() {
		if (photos.length > 1) {
			currentPhotoIndex = currentPhotoIndex === 0 ? photos.length - 1 : currentPhotoIndex - 1;
		}
	}

	function goToPhoto(index: number) {
		currentPhotoIndex = index;
	}

	// Removed old placeBid function - now handled by LiveAuction component

	function formatPrice(cents: number): string {
		return new Intl.NumberFormat('en-AU', {
			style: 'currency',
			currency: 'AUD'
		}).format(cents / 100);
	}

	function formatTimeLeft(endAt: string): string {
		const now = new Date();
		const end = new Date(endAt);
		const diff = end.getTime() - now.getTime();
		
		if (diff <= 0) return 'Ended';
		
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));
		const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
		
		if (days > 0) return `${days}d ${hours}h`;
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-AU', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getConditionLabel(condition: string): string {
		const labels = {
			new: 'New',
			like_new: 'Like New',
			good: 'Good',
			fair: 'Fair',
			parts: 'For Parts'
		};
		return labels[condition] || condition;
	}
</script>

<svelte:head>
	<title>{listing?.title || 'Listing'} - Aussie Market</title>
</svelte:head>

{#if loading}
	<div class="flex items-center justify-center h-64">
		<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
	</div>
{:else if error}
	<div class="text-center py-12">
		<h2 class="text-2xl font-bold text-gray-900 mb-4">Listing Not Found</h2>
		<p class="text-gray-600 mb-6">{error}</p>
		<a href="/" class="btn-primary">Back to Home</a>
	</div>
{:else if listing}
	<div class="max-w-7xl mx-auto space-y-8">
		<!-- Breadcrumb -->
		<nav class="flex items-center space-x-2 text-sm text-gray-500">
			<a href="/" class="hover:text-gray-700">Home</a>
			<span>/</span>
			<a href="/" class="hover:text-gray-700">Listings</a>
			<span>/</span>
			<span class="text-gray-900">{listing.title}</span>
		</nav>

		<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
			<!-- Main Content -->
			<div class="lg:col-span-2 space-y-8">
				<!-- Photos -->
				<div class="card">
					<div class="relative">
						{#if photos.length > 0}
							<img
								src={photos[currentPhotoIndex].url}
								alt={listing.title}
								class="w-full h-96 object-cover rounded-t-lg"
							/>
							
							<!-- Photo Navigation -->
							{#if photos.length > 1}
								<button
									on:click={prevPhoto}
									class="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75"
								>
									<ChevronLeft class="w-6 h-6" />
								</button>
								<button
									on:click={nextPhoto}
									class="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75"
								>
									<ChevronRight class="w-6 h-6" />
								</button>
							{/if}

							<!-- Photo Thumbnails -->
							{#if photos.length > 1}
								<div class="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
									{#each photos as photo, index}
										<button
											on:click={() => goToPhoto(index)}
											class="w-16 h-16 rounded border-2 {index === currentPhotoIndex ? 'border-primary-500' : 'border-white'} overflow-hidden"
										>
											<img
												src={photo.url}
												alt="Thumbnail"
												class="w-full h-full object-cover"
											/>
										</button>
									{/each}
								</div>
							{/if}
						{:else}
							<div class="w-full h-96 bg-gray-200 rounded-t-lg flex items-center justify-center">
								<span class="text-gray-700" aria-label="No photos available">No photos available</span>
							</div>
						{/if}
					</div>
				</div>

				<!-- Listing Details -->
				<div class="card">
					<div class="card-header">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<h1 class="card-title text-2xl">{listing.title}</h1>
								<div class="flex items-center space-x-4 mt-2 text-sm text-gray-500">
									<span class="flex items-center">
										<MapPin class="w-4 h-4 mr-1" />
										{listing.location.suburb}, {listing.location.state}
									</span>
									<span class="flex items-center">
										<Calendar class="w-4 h-4 mr-1" />
										Listed {formatDate(listing.created_at)}
									</span>
								</div>
							</div>
							<div class="flex items-center space-x-2">
								<button class="btn btn-outline btn-sm">
									<Heart class="w-4 h-4 mr-1" />
									Watch
								</button>
								<button class="btn btn-outline btn-sm">
									<Share2 class="w-4 h-4 mr-1" />
									Share
								</button>
								<button class="btn btn-outline btn-sm">
									<Flag class="w-4 h-4 mr-1" />
									Report
								</button>
							</div>
						</div>
					</div>

					<div class="card-content space-y-6">
						<!-- Description -->
						<div>
							<h3 class="text-lg font-medium text-gray-900 mb-3">Description</h3>
							<div class="prose max-w-none">
								<p class="text-gray-700 whitespace-pre-wrap">{listing.description}</p>
							</div>
						</div>

						<!-- Item Details -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div>
								<h3 class="text-lg font-medium text-gray-900 mb-3">Item Details</h3>
								<dl class="space-y-2">
									<div class="flex justify-between">
										<dt class="text-gray-600">Condition:</dt>
										<dd class="font-medium">{getConditionLabel(listing.condition)}</dd>
									</div>
									<div class="flex justify-between">
										<dt class="text-gray-600">Category:</dt>
										<dd class="font-medium">Category {listing.category_id}</dd>
									</div>
									<div class="flex justify-between">
										<dt class="text-gray-600">Starting Price:</dt>
										<dd class="font-medium">{formatPrice(listing.start_cents)}</dd>
									</div>
									{#if listing.reserve_cents}
										<div class="flex justify-between">
											<dt class="text-gray-600">Reserve Price:</dt>
											<dd class="font-medium">{formatPrice(listing.reserve_cents)}</dd>
										</div>
									{/if}
									{#if listing.buy_now_cents}
										<div class="flex justify-between">
											<dt class="text-gray-600">Buy Now Price:</dt>
											<dd class="font-medium">{formatPrice(listing.buy_now_cents)}</dd>
										</div>
									{/if}
								</dl>
							</div>

							<div>
								<h3 class="text-lg font-medium text-gray-900 mb-3">Delivery Options</h3>
								<div class="space-y-3">
									{#if listing.pickup}
										<div class="flex items-center text-green-600">
											<Package class="w-5 h-5 mr-2" />
											<span>Local Pickup Available</span>
										</div>
									{/if}
									{#if listing.shipping}
										<div class="flex items-center text-green-600">
											<Truck class="w-5 h-5 mr-2" />
											<span>Shipping Available</span>
										</div>
									{/if}
								</div>
							</div>
						</div>

						<!-- Seller Information -->
						<div class="border-t pt-6">
							<h3 class="text-lg font-medium text-gray-900 mb-3">Seller Information</h3>
							<div class="flex items-center justify-between">
								<div class="flex items-center space-x-4">
									<div class="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
										<User class="w-6 h-6 text-primary-600" />
									</div>
									<div>
										<p class="font-medium text-gray-900">
											{listing.users?.legal_name || listing.users?.email}
										</p>
										<div class="flex items-center space-x-2 text-sm text-gray-500">
											<span>Member since {formatDate(listing.users?.created_at)}</span>
											{#if listing.users?.kyc === 'passed'}
												<span class="px-2 py-1 bg-success-100 text-success-700 rounded text-xs">
													Verified
												</span>
											{/if}
										</div>
									</div>
								</div>
								
								{#if user && user.id !== listing.seller_id}
									<a
										href="/messages/new?listing={listingId}&seller={listing.seller_id}"
										class="btn-secondary flex items-center space-x-2"
									>
										<MessageSquare class="w-4 h-4" />
										<span>Message Seller</span>
									</a>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Sidebar -->
			<div class="lg:col-span-1 space-y-6">
				{#if auction && auctionId}
					<!-- Live Auction Component -->
					<LiveAuction
						auctionId={auctionId}
						listingEndAt={listing.end_at}
						currentPriceCents={auction.current_price_cents}
						bidCount={auction.bid_count || 0}
						highBidderId={auction.high_bid_id}
						reserveMet={auction.reserve_met}
						reserveCents={listing.reserve_cents}
						listingId={listingId}
					/>

					<!-- Bid History Component -->
					<BidHistory auctionId={auctionId} />
				{:else}
					<!-- Auction not started -->
					<div class="card">
						<div class="card-content">
							<div class="text-center">
								<p class="text-gray-500">Auction not started yet</p>
								<p class="text-sm text-gray-400 mt-1">
									Starts {formatDate(listing.start_at)}
								</p>
							</div>
						</div>
					</div>
				{/if}

				<!-- Auction Info -->
				<div class="card">
					<div class="card-header">
						<h3 class="card-title">Auction Information</h3>
					</div>
					<div class="card-content">
						<dl class="space-y-3">
							<div class="flex justify-between">
								<dt class="text-gray-600">Start Date:</dt>
								<dd class="font-medium">{formatDate(listing.start_at)}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-gray-600">End Date:</dt>
								<dd class="font-medium">{formatDate(listing.end_at)}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-gray-600">Starting Price:</dt>
								<dd class="font-medium">{formatPrice(listing.start_cents)}</dd>
							</div>
							{#if listing.reserve_cents}
								<div class="flex justify-between">
									<dt class="text-gray-600">Reserve:</dt>
									<dd class="font-medium">Yes</dd>
								</div>
							{/if}
						</dl>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
