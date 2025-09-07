<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { Search, Filter, Clock, MapPin, DollarSign } from 'lucide-svelte';

	let listings: any[] = [];
	let loading = true;
	let searchQuery = '';
	let selectedCategory = 'all';
	let selectedCondition = 'all';

	const categories = [
		{ id: 'all', name: 'All Categories' },
		{ id: '1', name: 'Electronics' },
		{ id: '2', name: 'Home & Garden' },
		{ id: '3', name: 'Fashion' },
		{ id: '4', name: 'Sports & Leisure' },
		{ id: '5', name: 'Collectibles' },
		{ id: '6', name: 'Vehicles' },
		{ id: '7', name: 'Books & Media' }
	];

	const conditions = [
		{ id: 'all', name: 'All Conditions' },
		{ id: 'new', name: 'New' },
		{ id: 'like_new', name: 'Like New' },
		{ id: 'good', name: 'Good' },
		{ id: 'fair', name: 'Fair' },
		{ id: 'parts', name: 'For Parts' }
	];

	onMount(async () => {
		await loadListings();
	});

	async function loadListings() {
		loading = true;
		
		let query = supabase
			.from('listings')
			.select(`
				*,
				auctions (
					id,
					current_price_cents,
					status,
					end_at
				),
				listing_photos (
					id,
					url,
					order_idx
				)
			`)
			.eq('status', 'live')
			.order('created_at', { ascending: false });

		// Apply filters
		if (selectedCategory !== 'all') {
			query = query.eq('category_id', selectedCategory);
		}
		if (selectedCondition !== 'all') {
			query = query.eq('condition', selectedCondition);
		}
		if (searchQuery) {
			query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
		}

		const { data, error } = await query;

		if (error) {
			console.error('Error loading listings:', error);
		} else {
			listings = data || [];
		}
		
		loading = false;
	}

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

	function getMainPhoto(photos: any[]): string {
		if (!photos || photos.length === 0) {
			return '/placeholder-image.jpg';
		}
		const sortedPhotos = photos.sort((a, b) => a.order_idx - b.order_idx);
		return sortedPhotos[0].url;
	}
</script>

<svelte:head>
	<title>Home - Aussie Market</title>
</svelte:head>

<div class="space-y-8">
	<!-- Hero Section -->
	<section class="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg p-8 text-white">
		<div class="max-w-3xl mx-auto text-center">
			<h1 class="text-4xl font-bold mb-4">
				Australia's Premier C2C Auction Platform
			</h1>
			<p class="text-xl mb-8 text-primary-100">
				Buy and sell with confidence. Secure payments, verified sellers, and buyer protection on every transaction.
			</p>
			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a href="/sell/new" class="btn bg-white text-primary-600 hover:bg-gray-100 btn-lg">
					Start Selling
				</a>
				<a href="/about" class="btn btn-outline border-white text-white hover:bg-white hover:text-primary-600 btn-lg">
					Learn More
				</a>
			</div>
		</div>
	</section>

	<!-- Search and Filters -->
	<section class="bg-white rounded-lg p-6 shadow-sm">
		<div class="flex flex-col lg:flex-row gap-4">
			<!-- Search -->
			<div class="flex-1">
				<div class="relative">
					<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
					<input
						type="text"
						placeholder="Search listings..."
						bind:value={searchQuery}
						on:input={loadListings}
						class="input pl-10 w-full"
					/>
				</div>
			</div>

			<!-- Category Filter -->
			<div class="lg:w-48">
				<label for="category" class="sr-only">Category</label>
				<select id="category" aria-label="Category" bind:value={selectedCategory} on:change={loadListings} class="input">
					{#each categories as category}
						<option value={category.id}>{category.name}</option>
					{/each}
				</select>
			</div>

			<!-- Condition Filter -->
			<div class="lg:w-48">
				<label for="condition" class="sr-only">Condition</label>
				<select id="condition" aria-label="Condition" bind:value={selectedCondition} on:change={loadListings} class="input">
					{#each conditions as condition}
						<option value={condition.id}>{condition.name}</option>
					{/each}
				</select>
			</div>
		</div>
	</section>

	<!-- Listings Grid -->
	<section>
		{#if loading}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
				{#each Array(8) as _}
					<div class="card animate-pulse">
						<div class="h-48 bg-gray-200 rounded-t-lg"></div>
						<div class="p-4 space-y-2">
							<div class="h-4 bg-gray-200 rounded"></div>
							<div class="h-4 bg-gray-200 rounded w-3/4"></div>
							<div class="h-4 bg-gray-200 rounded w-1/2"></div>
						</div>
					</div>
				{/each}
			</div>
		{:else if listings.length === 0}
			<div class="text-center py-12">
				<div class="text-gray-400 mb-4">
					<Search class="w-16 h-16 mx-auto" />
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No listings found</h3>
				<p class="text-gray-600">Try adjusting your search criteria or browse all categories.</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
				{#each listings as listing}
					<a href="/l/{listing.id}" class="card hover:shadow-md transition-shadow">
						<div class="relative">
							<img
								src={getMainPhoto(listing.listing_photos)}
								alt={listing.title}
								class="w-full h-48 object-cover rounded-t-lg"
							/>
							{#if listing.auctions && listing.auctions.length > 0}
								<div class="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-xs font-medium">
									Live Auction
								</div>
							{/if}
						</div>
						
						<div class="p-4 space-y-2">
							<h3 class="font-medium text-gray-900 line-clamp-2">
								{listing.title}
							</h3>
							
							<div class="flex items-center text-sm text-gray-500">
								<MapPin class="w-4 h-4 mr-1" />
								{listing.location.suburb}, {listing.location.state}
							</div>
							
							<div class="flex items-center justify-between">
								<div class="flex items-center text-sm text-gray-500">
									<Clock class="w-4 h-4 mr-1" />
									{#if listing.auctions && listing.auctions.length > 0}
										{formatTimeLeft(listing.auctions[0].end_at)}
									{:else}
										Ended
									{/if}
								</div>
								
								<div class="flex items-center font-medium text-gray-900">
									<DollarSign class="w-4 h-4 mr-1" />
									{#if listing.auctions && listing.auctions.length > 0}
										{formatPrice(listing.auctions[0].current_price_cents)}
									{:else}
										{formatPrice(listing.start_cents)}
									{/if}
								</div>
							</div>
							
							<div class="flex items-center justify-between text-xs text-gray-500">
								<span class="capitalize">{listing.condition.replace('_', ' ')}</span>
								<span>{listing.bids?.length || 0} bids</span>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Call to Action -->
	<section class="bg-secondary-50 rounded-lg p-8 text-center">
		<h2 class="text-2xl font-bold text-gray-900 mb-4">
			Ready to start selling?
		</h2>
		<p class="text-gray-600 mb-6 max-w-2xl mx-auto">
			Join thousands of Australians who trust Aussie Market for secure, transparent auctions. 
			Get started in minutes with our simple listing process.
		</p>
		<a href="/sell/new" class="btn-primary btn-lg">
			Create Your First Listing
		</a>
	</section>
</div>


