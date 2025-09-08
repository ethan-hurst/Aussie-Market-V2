<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { 
		User, 
		Settings, 
		Package, 
		Gavel, 
		ShoppingCart, 
		MessageSquare,
		Plus,
		Edit,
		Eye,
		Clock,
		CheckCircle,
		XCircle,
		AlertCircle
	} from 'lucide-svelte';

	let user: any = null;
	let userProfile: any = null;
	let loading = true;
	let activeTab = 'overview';

	// Data for different tabs
	let myListings: any[] = [];
	let myBids: any[] = [];
	let myOrders: any[] = [];
	let myMessages: any[] = [];

	onMount(async () => {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session) {
			goto('/login');
			return;
		}

		user = session.user;
		await loadUserProfile();
		await loadDashboardData();
		loading = false;
	});

	async function loadUserProfile() {
		const { data, error } = await supabase
			.from('users')
			.select('*')
			.eq('id', user.id)
			.single();

		if (error) {
			console.error('Error loading user profile:', error);
		} else {
			userProfile = data;
		}
	}

	async function loadDashboardData() {
		await Promise.all([
			loadMyListings(),
			loadMyBids(),
			loadMyOrders(),
			loadMyMessages()
		]);
	}

	async function loadMyListings() {
		const { data, error } = await supabase
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
			.eq('seller_id', user.id)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error loading listings:', error);
		} else {
			myListings = data || [];
		}
	}

	async function loadMyBids() {
		const { data, error } = await supabase
			.from('bids')
			.select(`
				*,
				auctions (
					id,
					listing_id,
					current_price_cents,
					status
				),
				listings!auctions_listing_id_fkey (
					id,
					title,
					status,
					end_at,
					listing_photos (
						id,
						url,
						order_idx
					)
				)
			`)
			.eq('bidder_id', user.id)
			.order('placed_at', { ascending: false });

		if (error) {
			console.error('Error loading bids:', error);
		} else {
			myBids = data || [];
		}
	}

	async function loadMyOrders() {
		const { data, error } = await supabase
			.from('orders')
			.select(`
				*,
				listings (
					id,
					title,
					listing_photos (
						id,
						url,
						order_idx
					)
				)
			`)
			.or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error loading orders:', error);
		} else {
			myOrders = data || [];
		}
	}

	async function loadMyMessages() {
		const { data, error } = await supabase
			.from('message_threads')
			.select(`
				*,
				messages (
					id,
					content,
					created_at,
					sender_id
				)
			`)
			.or(`listing_id.in.(${myListings.map(l => l.id).join(',')})`)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error loading messages:', error);
		} else {
			myMessages = data || [];
		}
	}

	function formatPrice(cents: number): string {
		return new Intl.NumberFormat('en-AU', {
			style: 'currency',
			currency: 'AUD'
		}).format(cents / 100);
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-AU', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function getMainPhoto(photos: any[]): string {
		if (!photos || photos.length === 0) {
			return '/placeholder-image.jpg';
		}
		const sortedPhotos = photos.sort((a, b) => a.order_idx - b.order_idx);
		return sortedPhotos[0].url;
	}

	function getOrderStatusColor(status: string): string {
		const colors = {
			pending_payment: 'text-yellow-600 bg-yellow-100',
			paid: 'text-blue-600 bg-blue-100',
			ready_for_handover: 'text-purple-600 bg-purple-100',
			shipped: 'text-indigo-600 bg-indigo-100',
			delivered: 'text-green-600 bg-green-100',
			released: 'text-green-600 bg-green-100',
			refunded: 'text-red-600 bg-red-100',
			cancelled: 'text-gray-600 bg-gray-100'
		};
		return colors[status] || 'text-gray-600 bg-gray-100';
	}

	function getListingStatusColor(status: string): string {
		const colors = {
			scheduled: 'text-blue-600 bg-blue-100',
			live: 'text-green-600 bg-green-100',
			ended: 'text-gray-600 bg-gray-100',
			cancelled: 'text-red-600 bg-red-100'
		};
		return colors[status] || 'text-gray-600 bg-gray-100';
	}
</script>

<svelte:head>
	<title>My Account - Aussie Market</title>
</svelte:head>

{#if loading}
	<div class="flex items-center justify-center h-64">
		<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
	</div>
{:else}
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="text-3xl font-bold text-gray-900">My Account</h1>
			<p class="text-gray-600">Manage your listings, bids, and orders</p>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
			<!-- Sidebar -->
			<div class="lg:col-span-1">
				<div class="bg-white rounded-lg shadow-sm p-6">
					<!-- User Info -->
					<div class="text-center mb-6">
						<div class="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-4">
							<User class="w-8 h-8 text-white" />
						</div>
						<h3 class="font-medium text-gray-900">{userProfile?.legal_name || 'User'}</h3>
						<p class="text-sm text-gray-500">{user.email}</p>
						<span class="inline-block mt-2 px-2 py-1 text-xs font-medium bg-primary-100 text-primary-800 rounded-full capitalize">
							{userProfile?.role || 'buyer'}
						</span>
					</div>

					<!-- Navigation -->
					<nav class="space-y-2">
						<button
							on:click={() => activeTab = 'overview'}
							class="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
							class:bg-primary-50={activeTab === 'overview'}
							class:text-primary-700={activeTab === 'overview'}
							class:text-gray-700={activeTab !== 'overview'}
						>
							<Package class="w-5 h-5 mr-3" />
							Overview
						</button>
						<button
							on:click={() => activeTab = 'listings'}
							class="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
							class:bg-primary-50={activeTab === 'listings'}
							class:text-primary-700={activeTab === 'listings'}
							class:text-gray-700={activeTab !== 'listings'}
						>
							<Package class="w-5 h-5 mr-3" />
							My Listings
						</button>
						<button
							on:click={() => activeTab = 'bids'}
							class="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
							class:bg-primary-50={activeTab === 'bids'}
							class:text-primary-700={activeTab === 'bids'}
							class:text-gray-700={activeTab !== 'bids'}
						>
							<Gavel class="w-5 h-5 mr-3" />
							My Bids
						</button>
						<button
							on:click={() => activeTab = 'orders'}
							class="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
							class:bg-primary-50={activeTab === 'orders'}
							class:text-primary-700={activeTab === 'orders'}
							class:text-gray-700={activeTab !== 'orders'}
						>
							<ShoppingCart class="w-5 h-5 mr-3" />
							My Orders
						</button>
						<button
							on:click={() => activeTab = 'messages'}
							class="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
							class:bg-primary-50={activeTab === 'messages'}
							class:text-primary-700={activeTab === 'messages'}
							class:text-gray-700={activeTab !== 'messages'}
						>
							<MessageSquare class="w-5 h-5 mr-3" />
							Messages
						</button>
						<button
							on:click={() => activeTab = 'settings'}
							class="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
							class:bg-primary-50={activeTab === 'settings'}
							class:text-primary-700={activeTab === 'settings'}
							class:text-gray-700={activeTab !== 'settings'}
						>
							<Settings class="w-5 h-5 mr-3" />
							Settings
						</button>
					</nav>
				</div>
			</div>

			<!-- Main Content -->
			<div class="lg:col-span-3">
				{#if activeTab === 'overview'}
					<div class="space-y-6">
						<!-- Stats Cards -->
						<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
							<div class="bg-white rounded-lg shadow-sm p-6">
								<div class="flex items-center">
									<div class="p-2 bg-blue-100 rounded-lg">
										<Package class="w-6 h-6 text-blue-600" />
									</div>
									<div class="ml-4">
										<p class="text-sm font-medium text-gray-500">Active Listings</p>
										<p class="text-2xl font-bold text-gray-900">
											{myListings.filter(l => l.status === 'live').length}
										</p>
									</div>
								</div>
							</div>

							<div class="bg-white rounded-lg shadow-sm p-6">
								<div class="flex items-center">
									<div class="p-2 bg-green-100 rounded-lg">
										<Gavel class="w-6 h-6 text-green-600" />
									</div>
									<div class="ml-4">
										<p class="text-sm font-medium text-gray-500">Active Bids</p>
										<p class="text-2xl font-bold text-gray-900">
											{myBids.filter(b => b.auctions?.status === 'live').length}
										</p>
									</div>
								</div>
							</div>

							<div class="bg-white rounded-lg shadow-sm p-6">
								<div class="flex items-center">
									<div class="p-2 bg-purple-100 rounded-lg">
										<ShoppingCart class="w-6 h-6 text-purple-600" />
									</div>
									<div class="ml-4">
										<p class="text-sm font-medium text-gray-500">Pending Orders</p>
										<p class="text-2xl font-bold text-gray-900">
											{myOrders.filter(o => o.state === 'pending_payment').length}
										</p>
									</div>
								</div>
							</div>
						</div>

						<!-- Recent Activity -->
						<div class="bg-white rounded-lg shadow-sm">
							<div class="px-6 py-4 border-b border-gray-200">
								<h3 class="text-lg font-medium text-gray-900">Recent Activity</h3>
							</div>
							<div class="p-6">
								{#if myListings.length === 0 && myBids.length === 0 && myOrders.length === 0}
									<div class="text-center py-8">
										<Package class="w-12 h-12 text-gray-400 mx-auto mb-4" />
										<p class="text-gray-500">No activity yet. Start by creating a listing or placing a bid!</p>
										<div class="mt-4 space-x-4">
											<a href="/sell/new" class="btn-primary">Create Listing</a>
											<a href="/" class="btn btn-outline">Browse Listings</a>
										</div>
									</div>
								{:else}
									<div class="space-y-4">
										{#each [...myListings.slice(0, 3), ...myBids.slice(0, 3), ...myOrders.slice(0, 3)]
											.sort((a, b) => new Date(b.created_at || b.placed_at).getTime() - new Date(a.created_at || a.placed_at).getTime())
											.slice(0, 5) as item}
											<div class="flex items-center space-x-4">
												<div class="flex-shrink-0">
													{#if item.title}
														<Package class="w-5 h-5 text-blue-600" />
													{:else if item.amount_cents}
														<Gavel class="w-5 h-5 text-green-600" />
													{:else}
														<ShoppingCart class="w-5 h-5 text-purple-600" />
													{/if}
												</div>
												<div class="flex-1 min-w-0">
													<p class="text-sm font-medium text-gray-900 truncate">
														{#if item.title}
															Listing: {item.title}
														{:else if item.amount_cents}
															Bid: {formatPrice(item.amount_cents)}
														{:else}
															Order: {formatPrice(item.amount_cents)}
														{/if}
													</p>
													<p class="text-sm text-gray-500">
														{formatDate(item.created_at || item.placed_at)}
													</p>
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</div>

				{:else if activeTab === 'listings'}
					<div class="bg-white rounded-lg shadow-sm">
						<div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
							<h3 class="text-lg font-medium text-gray-900">My Listings</h3>
							<a href="/sell/new" class="btn-primary">
								<Plus class="w-4 h-4 mr-2" />
								Create Listing
							</a>
						</div>
						<div class="p-6">
							{#if myListings.length === 0}
								<div class="text-center py-8">
									<Package class="w-12 h-12 text-gray-400 mx-auto mb-4" />
									<p class="text-gray-500 mb-4">You haven't created any listings yet.</p>
									<a href="/sell/new" class="btn-primary">Create Your First Listing</a>
								</div>
							{:else}
								<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
									{#each myListings as listing}
										<div class="border rounded-lg overflow-hidden">
											<div class="relative">
												<img
													src={getMainPhoto(listing.listing_photos)}
													alt={listing.title}
													class="w-full h-48 object-cover"
												/>
												<span class="absolute top-2 right-2 px-2 py-1 text-xs font-medium rounded {getListingStatusColor(listing.status)}">
													{listing.status}
												</span>
											</div>
											<div class="p-4">
												<h4 class="font-medium text-gray-900 mb-2">{listing.title}</h4>
												<p class="text-sm text-gray-500 mb-3">
													{formatDate(listing.created_at)}
												</p>
												<div class="flex justify-between items-center">
													<span class="text-sm font-medium text-gray-900">
														{formatPrice(listing.start_cents)}
													</span>
													<div class="space-x-2">
														<a href="/l/{listing.id}" class="btn btn-sm btn-outline">
															<Eye class="w-4 h-4" />
														</a>
														<a href="/sell/edit/{listing.id}" class="btn btn-sm btn-outline">
															<Edit class="w-4 h-4" />
														</a>
													</div>
												</div>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>

				{:else if activeTab === 'bids'}
					<div class="bg-white rounded-lg shadow-sm">
						<div class="px-6 py-4 border-b border-gray-200">
							<h3 class="text-lg font-medium text-gray-900">My Bids</h3>
						</div>
						<div class="p-6">
							{#if myBids.length === 0}
								<div class="text-center py-8">
									<Gavel class="w-12 h-12 text-gray-400 mx-auto mb-4" />
									<p class="text-gray-500 mb-4">You haven't placed any bids yet.</p>
									<a href="/" class="btn-primary">Browse Listings</a>
								</div>
							{:else}
								<div class="space-y-4">
									{#each myBids as bid}
										<div class="flex items-center space-x-4 p-4 border rounded-lg">
											<img
												src={getMainPhoto(bid.listings?.listing_photos)}
												alt={bid.listings?.title}
												class="w-16 h-16 object-cover rounded"
											/>
											<div class="flex-1">
												<h4 class="font-medium text-gray-900">{bid.listings?.title}</h4>
												<p class="text-sm text-gray-500">
													Bid: {formatPrice(bid.amount_cents)} • {formatDate(bid.placed_at)}
												</p>
											</div>
											<div class="text-right">
												<span class="text-sm font-medium text-gray-900">
													{formatPrice(bid.auctions?.current_price_cents || 0)}
												</span>
												<p class="text-xs text-gray-500">Current Price</p>
											</div>
											<a href="/l/{bid.listings?.id}" class="btn btn-sm btn-outline">
												<Eye class="w-4 h-4" />
											</a>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>

				{:else if activeTab === 'orders'}
					<div class="bg-white rounded-lg shadow-sm">
						<div class="px-6 py-4 border-b border-gray-200">
							<h3 class="text-lg font-medium text-gray-900">My Orders</h3>
						</div>
						<div class="p-6">
							{#if myOrders.length === 0}
								<div class="text-center py-8">
									<ShoppingCart class="w-12 h-12 text-gray-400 mx-auto mb-4" />
									<p class="text-gray-500 mb-4">You haven't made any orders yet.</p>
									<a href="/" class="btn-primary">Browse Listings</a>
								</div>
							{:else}
								<div class="space-y-4">
									{#each myOrders as order}
										<div class="flex items-center space-x-4 p-4 border rounded-lg">
											<img
												src={getMainPhoto(order.listings?.listing_photos)}
												alt={order.listings?.title}
												class="w-16 h-16 object-cover rounded"
											/>
											<div class="flex-1">
												<h4 class="font-medium text-gray-900">{order.listings?.title}</h4>
												<p class="text-sm text-gray-500">
													{formatDate(order.created_at)}
												</p>
											</div>
											<div class="text-right">
												<span class="text-sm font-medium text-gray-900">
													{formatPrice(order.amount_cents)}
												</span>
												<span class="inline-block mt-1 px-2 py-1 text-xs font-medium rounded {getOrderStatusColor(order.state)}">
													{order.state.replace('_', ' ')}
												</span>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>

				{:else if activeTab === 'messages'}
					<div class="bg-white rounded-lg shadow-sm">
						<div class="px-6 py-4 border-b border-gray-200">
							<h3 class="text-lg font-medium text-gray-900">Messages</h3>
						</div>
						<div class="p-6">
							{#if myMessages.length === 0}
								<div class="text-center py-8">
									<MessageSquare class="w-12 h-12 text-gray-400 mx-auto mb-4" />
									<p class="text-gray-500">No messages yet.</p>
								</div>
							{:else}
								<div class="space-y-4">
									{#each myMessages as thread}
										<div class="p-4 border rounded-lg">
											<div class="flex justify-between items-start">
												<div>
													<p class="font-medium text-gray-900">
														{thread.listing_id ? 'Listing Inquiry' : 'Order Message'}
													</p>
													<p class="text-sm text-gray-500">
														{formatDate(thread.created_at)}
													</p>
												</div>
												<a href="/messages/{thread.id}" class="btn btn-sm btn-outline">
													View
												</a>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>

				{:else if activeTab === 'settings'}
					<div class="bg-white rounded-lg shadow-sm">
						<div class="px-6 py-4 border-b border-gray-200">
							<h3 class="text-lg font-medium text-gray-900">Account Settings</h3>
						</div>
						<div class="p-6">
							<div class="space-y-6">
								<div>
									<h4 class="text-lg font-medium text-gray-900 mb-4">Profile Information</h4>
									<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div>
											<label class="block text-sm font-medium text-gray-700">Legal Name</label>
											<p class="mt-1 text-sm text-gray-900">{userProfile?.legal_name || 'Not provided'}</p>
										</div>
										<div>
											<label class="block text-sm font-medium text-gray-700">Email</label>
											<p class="mt-1 text-sm text-gray-900">{user.email}</p>
										</div>
										<div>
											<label class="block text-sm font-medium text-gray-700">Phone</label>
											<p class="mt-1 text-sm text-gray-900">{userProfile?.phone || 'Not provided'}</p>
										</div>
										<div>
											<label class="block text-sm font-medium text-gray-700">Role</label>
											<p class="mt-1 text-sm text-gray-900 capitalize">{userProfile?.role || 'buyer'}</p>
										</div>
									</div>
								</div>

								<div>
									<h4 class="text-lg font-medium text-gray-900 mb-4">Address</h4>
									<div class="text-sm text-gray-900">
										{#if userProfile?.address}
											<p>{userProfile.address.street}</p>
											<p>{userProfile.address.suburb}, {userProfile.address.state} {userProfile.address.postcode}</p>
										{:else}
											<p class="text-gray-500">No address provided</p>
										{/if}
									</div>
								</div>

								<div class="pt-4 border-t border-gray-200">
									<a href="/account/settings" class="btn-primary">
										Edit Profile
									</a>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
