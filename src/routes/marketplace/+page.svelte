<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { 
		Search, 
		Filter, 
		Clock, 
		MapPin, 
		DollarSign, 
		Package,
		ChevronLeft,
		ChevronRight,
		Grid3X3,
		List,
		SlidersHorizontal
	} from 'lucide-svelte';
	import { formatPrice, getTimeLeft, getCategory, getCondition } from '$lib/listings';

	export let data;

	let searchQuery = data.filters.search || '';
	let selectedCategory = data.filters.category || 'all';
	let selectedState = data.filters.state || 'all';
	let selectedCondition = data.filters.condition || 'all';
	let minPrice = data.filters.minPrice || '';
	let maxPrice = data.filters.maxPrice || '';
	let selectedStatus = data.filters.status || 'live';
	let selectedSort = data.filters.sort || 'newest';
	let viewMode = 'grid'; // grid or list
	let showFilters = false;

	// Reactive statements for URL updates
	$: currentUrl = $page.url;

	onMount(() => {
		// Update search input when URL changes (back/forward navigation)
		searchQuery = $page.url.searchParams.get('search') || '';
	});

	function updateUrl() {
		const params = new URLSearchParams();
		
		if (searchQuery.trim()) params.set('search', searchQuery.trim());
		if (selectedCategory !== 'all') params.set('category', selectedCategory);
		if (selectedState !== 'all') params.set('state', selectedState);
		if (selectedCondition !== 'all') params.set('condition', selectedCondition);
		if (minPrice) params.set('min_price', minPrice);
		if (maxPrice) params.set('max_price', maxPrice);
		if (selectedStatus !== 'live') params.set('status', selectedStatus);
		if (selectedSort !== 'newest') params.set('sort', selectedSort);
		
		// Reset to page 1 when filters change
		params.delete('page');

		goto(`/marketplace?${params.toString()}`, { replaceState: true });
	}

	function handleSearch() {
		updateUrl();
	}

	function clearFilters() {
		searchQuery = '';
		selectedCategory = 'all';
		selectedState = 'all';
		selectedCondition = 'all';
		minPrice = '';
		maxPrice = '';
		selectedStatus = 'live';
		selectedSort = 'newest';
		updateUrl();
	}

	function goToPage(pageNum: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`/marketplace?${params.toString()}`);
	}

	function getListingImage(listing: any): string {
		if (listing.listing_photos && listing.listing_photos.length > 0) {
			// Sort by order_idx and get first image
			const sortedPhotos = listing.listing_photos.sort((a: any, b: any) => (a.order_idx || 0) - (b.order_idx || 0));
			return sortedPhotos[0].url;
		}
		return '/placeholder-image.jpg';
	}

	function getTimeRemainingDisplay(endAt: string): string {
		const timeLeft = getTimeLeft(endAt);
		if (timeLeft.ended) return 'Ended';
		
		if (timeLeft.days > 0) {
			return `${timeLeft.days}d ${timeLeft.hours}h`;
		} else if (timeLeft.hours > 0) {
			return `${timeLeft.hours}h ${timeLeft.minutes}m`;
		} else {
			return `${timeLeft.minutes}m ${timeLeft.seconds}s`;
		}
	}

	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'live': return 'bg-green-100 text-green-800';
			case 'ended': return 'bg-gray-100 text-gray-800';
			case 'scheduled': return 'bg-blue-100 text-blue-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	// Generate pagination array
	$: paginationArray = (() => {
		const { page, totalPages } = data;
		const pages = [];
		const maxVisiblePages = 5;

		if (totalPages <= maxVisiblePages) {
			for (let i = 1; i <= totalPages; i++) {
				pages.push(i);
			}
		} else {
			pages.push(1);
			
			if (page > 3) {
				pages.push('...');
			}
			
			const start = Math.max(2, page - 1);
			const end = Math.min(totalPages - 1, page + 1);
			
			for (let i = start; i <= end; i++) {
				pages.push(i);
			}
			
			if (page < totalPages - 2) {
				pages.push('...');
			}
			
			pages.push(totalPages);
		}

		return pages;
	})();
</script>

<svelte:head>
	<title>Marketplace - Aussie Market</title>
	<meta name="description" content="Browse and discover amazing items in Australia's premier auction marketplace" />
</svelte:head>

<main id="main" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<!-- Page Header -->
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900 mb-2">Marketplace</h1>
		<p class="text-lg text-gray-600">Discover amazing items from sellers across Australia</p>
		
		{#if data.totalCount > 0}
			<p class="text-sm text-gray-500 mt-2">
				Showing {((data.page - 1) * data.limit) + 1}–{Math.min(data.page * data.limit, data.totalCount)} of {data.totalCount} items
			</p>
		{/if}
	</div>

	<!-- Search and Filters -->
	<div class="mb-8 bg-white rounded-lg shadow-sm border p-6">
		<!-- Search Bar -->
		<div class="mb-6">
			<form on:submit|preventDefault={handleSearch} class="flex gap-4">
				<div class="flex-1 relative">
					<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search listings..."
						class="input pl-10 w-full"
						data-testid="marketplace-search"
					/>
				</div>
				<button
					type="submit"
					class="btn-primary px-6"
					data-testid="search-button"
				>
					Search
				</button>
				<button
					type="button"
					on:click={() => showFilters = !showFilters}
					class="btn-secondary flex items-center gap-2"
					data-testid="toggle-filters"
				>
					<SlidersHorizontal class="w-4 h-4" />
					Filters
				</button>
			</form>
		</div>

		<!-- Advanced Filters -->
		{#if showFilters}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-6 border-t">
				<!-- Category Filter -->
				<div>
					<label for="category" class="block text-sm font-medium text-gray-700 mb-2">Category</label>
					<select
						id="category"
						bind:value={selectedCategory}
						on:change={updateUrl}
						class="input w-full"
						data-testid="category-filter"
					>
						<option value="all">All Categories</option>
						{#each data.categories as category}
							<option value={category.id.toString()}>{category.name}</option>
						{/each}
					</select>
				</div>

				<!-- Location Filter -->
				<div>
					<label for="state" class="block text-sm font-medium text-gray-700 mb-2">State</label>
					<select
						id="state"
						bind:value={selectedState}
						on:change={updateUrl}
						class="input w-full"
						data-testid="state-filter"
					>
						<option value="all">All States</option>
						{#each data.states as state}
							<option value={state.code}>{state.name}</option>
						{/each}
					</select>
				</div>

				<!-- Condition Filter -->
				<div>
					<label for="condition" class="block text-sm font-medium text-gray-700 mb-2">Condition</label>
					<select
						id="condition"
						bind:value={selectedCondition}
						on:change={updateUrl}
						class="input w-full"
						data-testid="condition-filter"
					>
						<option value="all">All Conditions</option>
						{#each data.conditions as condition}
							<option value={condition.id}>{condition.name}</option>
						{/each}
					</select>
				</div>

				<!-- Status Filter -->
				<div>
					<label for="status" class="block text-sm font-medium text-gray-700 mb-2">Status</label>
					<select
						id="status"
						bind:value={selectedStatus}
						on:change={updateUrl}
						class="input w-full"
						data-testid="status-filter"
					>
						<option value="live">Live Auctions</option>
						<option value="ending_soon">Ending Soon</option>
						<option value="ended">Recently Ended</option>
					</select>
				</div>

				<!-- Price Range -->
				<div class="md:col-span-2">
					<label class="block text-sm font-medium text-gray-700 mb-2">Price Range</label>
					<div class="flex gap-2">
						<input
							type="number"
							bind:value={minPrice}
							on:blur={updateUrl}
							placeholder="Min $"
							step="0.01"
							class="input flex-1"
							data-testid="min-price"
						/>
						<input
							type="number"
							bind:value={maxPrice}
							on:blur={updateUrl}
							placeholder="Max $"
							step="0.01"
							class="input flex-1"
							data-testid="max-price"
						/>
					</div>
				</div>

				<!-- Clear Filters -->
				<div class="flex items-end">
					<button
						type="button"
						on:click={clearFilters}
						class="btn-secondary w-full"
						data-testid="clear-filters"
					>
						Clear Filters
					</button>
				</div>
			</div>
		{/if}

		<!-- Sort and View Options -->
		<div class="flex justify-between items-center mt-6 pt-6 border-t">
			<div class="flex items-center gap-4">
				<label for="sort" class="text-sm font-medium text-gray-700">Sort by:</label>
				<select
					id="sort"
					bind:value={selectedSort}
					on:change={updateUrl}
					class="input w-auto"
					data-testid="sort-select"
				>
					<option value="newest">Newest First</option>
					<option value="ending_soon">Ending Soon</option>
					<option value="price_low">Price: Low to High</option>
					<option value="price_high">Price: High to Low</option>
				</select>
			</div>

			<div class="flex items-center gap-2">
				<span class="text-sm text-gray-700">View:</span>
				<button
					on:click={() => viewMode = 'grid'}
					class="p-2 rounded-md {viewMode === 'grid' ? 'bg-primary-100 text-primary-600' : 'text-gray-400 hover:text-gray-600'}"
					data-testid="grid-view"
				>
					<Grid3X3 class="w-4 h-4" />
				</button>
				<button
					on:click={() => viewMode = 'list'}
					class="p-2 rounded-md {viewMode === 'list' ? 'bg-primary-100 text-primary-600' : 'text-gray-400 hover:text-gray-600'}"
					data-testid="list-view"
				>
					<List class="w-4 h-4" />
				</button>
			</div>
		</div>
	</div>

	<!-- Error Message -->
	{#if data.error}
		<div class="bg-red-50 border border-red-200 rounded-md p-4 mb-8">
			<p class="text-red-700">{data.error}</p>
		</div>
	{/if}

	<!-- Listings Grid/List -->
	{#if data.listings && data.listings.length > 0}
		<div class="mb-8">
			{#if viewMode === 'grid'}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" data-testid="listings-grid">
					{#each data.listings as listing}
						<a
							href="/l/{listing.id}"
							class="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow duration-200"
							data-testid="listing-card"
						>
							<!-- Image -->
							<div class="aspect-square bg-gray-100 rounded-t-lg overflow-hidden">
								<img
									src={getListingImage(listing)}
									alt={listing.title}
									class="w-full h-full object-cover"
									loading="lazy"
								/>
							</div>

							<!-- Content -->
							<div class="p-4">
								<!-- Title and Status -->
								<div class="flex justify-between items-start mb-2">
									<h3 class="font-semibold text-gray-900 line-clamp-2 flex-1" data-testid="listing-title">
										{listing.title}
									</h3>
									<span class="ml-2 px-2 py-1 rounded-full text-xs font-medium {getStatusBadgeClass(listing.status)}">
										{listing.status}
									</span>
								</div>

								<!-- Price -->
								<div class="flex items-center mb-2">
									<DollarSign class="w-4 h-4 text-green-600 mr-1" />
									<span class="text-lg font-bold text-gray-900" data-testid="listing-price">
										{formatPrice(listing.start_cents)}
									</span>
								</div>

								<!-- Location and Time -->
								<div class="space-y-1 text-sm text-gray-600">
									<div class="flex items-center">
										<MapPin class="w-3 h-3 mr-1" />
										<span>{listing.location.suburb}, {listing.location.state}</span>
									</div>
									{#if listing.status === 'live'}
										<div class="flex items-center">
											<Clock class="w-3 h-3 mr-1" />
											<span class="text-red-600 font-medium" data-testid="time-remaining">
												{getTimeRemainingDisplay(listing.end_at)}
											</span>
										</div>
									{/if}
								</div>

								<!-- Category and Condition -->
								<div class="mt-3 flex items-center justify-between text-xs text-gray-500">
									<span>{getCategory(listing.category_id)?.name}</span>
									<span>{getCondition(listing.condition)?.name}</span>
								</div>
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<!-- List View -->
				<div class="space-y-4" data-testid="listings-list">
					{#each data.listings as listing}
						<a
							href="/l/{listing.id}"
							class="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow duration-200 p-6 flex"
							data-testid="listing-card"
						>
							<!-- Image -->
							<div class="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 mr-4">
								<img
									src={getListingImage(listing)}
									alt={listing.title}
									class="w-full h-full object-cover"
									loading="lazy"
								/>
							</div>

							<!-- Content -->
							<div class="flex-1 min-w-0">
								<div class="flex justify-between items-start mb-2">
									<h3 class="text-lg font-semibold text-gray-900 line-clamp-1" data-testid="listing-title">
										{listing.title}
									</h3>
									<span class="ml-4 px-2 py-1 rounded-full text-xs font-medium {getStatusBadgeClass(listing.status)}">
										{listing.status}
									</span>
								</div>

								<p class="text-gray-600 text-sm line-clamp-2 mb-3">{listing.description}</p>

								<div class="flex items-center justify-between">
									<div class="flex items-center space-x-4 text-sm text-gray-600">
										<div class="flex items-center">
											<DollarSign class="w-4 h-4 text-green-600 mr-1" />
											<span class="text-lg font-bold text-gray-900" data-testid="listing-price">
												{formatPrice(listing.start_cents)}
											</span>
										</div>
										<div class="flex items-center">
											<MapPin class="w-3 h-3 mr-1" />
											<span>{listing.location.suburb}, {listing.location.state}</span>
										</div>
										{#if listing.status === 'live'}
											<div class="flex items-center">
												<Clock class="w-3 h-3 mr-1" />
												<span class="text-red-600 font-medium" data-testid="time-remaining">
													{getTimeRemainingDisplay(listing.end_at)}
												</span>
											</div>
										{/if}
									</div>

									<div class="text-xs text-gray-500">
										{getCategory(listing.category_id)?.name} • {getCondition(listing.condition)?.name}
									</div>
								</div>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Pagination -->
		{#if data.totalPages > 1}
			<div class="flex justify-center items-center space-x-2" data-testid="pagination">
				<button
					on:click={() => goToPage(data.page - 1)}
					disabled={data.page <= 1}
					class="btn-secondary flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
					data-testid="prev-page"
				>
					<ChevronLeft class="w-4 h-4" />
					Previous
				</button>

				{#each paginationArray as pageNum}
					{#if pageNum === '...'}
						<span class="px-3 py-2 text-gray-500">...</span>
					{:else}
						<button
							on:click={() => goToPage(pageNum)}
							class="px-3 py-2 rounded-md text-sm font-medium transition-colors {pageNum === data.page ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-100'}"
							data-testid="page-{pageNum}"
						>
							{pageNum}
						</button>
					{/if}
				{/each}

				<button
					on:click={() => goToPage(data.page + 1)}
					disabled={data.page >= data.totalPages}
					class="btn-secondary flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
					data-testid="next-page"
				>
					Next
					<ChevronRight class="w-4 h-4" />
				</button>
			</div>
		{/if}
	{:else}
		<!-- No Results -->
		<div class="text-center py-12">
			<Package class="w-16 h-16 text-gray-400 mx-auto mb-4" />
			<h3 class="text-lg font-medium text-gray-900 mb-2">No listings found</h3>
			<p class="text-gray-600 mb-4">
				{#if searchQuery || selectedCategory !== 'all' || selectedState !== 'all' || selectedCondition !== 'all' || minPrice || maxPrice}
					Try adjusting your search criteria or clearing filters.
				{:else}
					There are no listings available right now. Check back later!
				{/if}
			</p>
			{#if searchQuery || selectedCategory !== 'all' || selectedState !== 'all' || selectedCondition !== 'all' || minPrice || maxPrice}
				<button
					on:click={clearFilters}
					class="btn-primary"
					data-testid="clear-all-filters"
				>
					Clear All Filters
				</button>
			{/if}
		</div>
	{/if}
</main>