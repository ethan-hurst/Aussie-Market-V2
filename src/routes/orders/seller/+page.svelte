<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { Package, Truck, CheckCircle, Clock, AlertCircle, Circle } from 'lucide-svelte';

	let orders: any[] = [];
	let loading = true;
	let user: any = null;

	onMount(async () => {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session) {
			goto('/login');
			return;
		}

		user = session.user;
		await loadOrders();
	});

	async function loadOrders() {
		try {
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
					),
					users!orders_buyer_id_fkey (
						id,
						legal_name
					)
				`)
				.eq('seller_id', user.id)
				.order('created_at', { ascending: false });

			if (error) {
				console.error('Error loading orders:', error);
			} else {
				orders = data || [];
			}
		} catch (err) {
			console.error('Error:', err);
		} finally {
			loading = false;
		}
	}

	function getOrderStatusIcon(state: string) {
		switch (state) {
			case 'pending': return Circle;
			case 'paid': return CheckCircle;
			case 'ready_for_handover': return Package;
			case 'shipped': return Truck;
			case 'delivered': return CheckCircle;
			case 'released': return CheckCircle;
			case 'refunded': return AlertCircle;
			case 'cancelled': return AlertCircle;
			default: return Clock;
		}
	}

	function getOrderStatusClass(state: string) {
		switch (state) {
			case 'pending': return 'text-yellow-600 bg-yellow-100';
			case 'paid': return 'text-green-600 bg-green-100';
			case 'ready_for_handover': return 'text-blue-600 bg-blue-100';
			case 'shipped': return 'text-purple-600 bg-purple-100';
			case 'delivered': return 'text-green-600 bg-green-100';
			case 'released': return 'text-green-600 bg-green-100';
			case 'refunded': return 'text-red-600 bg-red-100';
			case 'cancelled': return 'text-red-600 bg-red-100';
			default: return 'text-gray-600 bg-gray-100';
		}
	}

	function formatPrice(cents: number) {
		return new Intl.NumberFormat('en-AU', {
			style: 'currency',
			currency: 'AUD'
		}).format(cents / 100);
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('en-AU', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function getListingImage(listing: any): string {
		if (listing?.listing_photos && listing.listing_photos.length > 0) {
			const sortedPhotos = listing.listing_photos.sort((a: any, b: any) => (a.order_idx || 0) - (b.order_idx || 0));
			return sortedPhotos[0].url;
		}
		return '/placeholder-image.jpg';
	}
</script>

<svelte:head>
	<title>Seller Orders - Aussie Market</title>
</svelte:head>

<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900">Your Sales</h1>
		<p class="text-gray-600 mt-2">Manage orders from buyers who purchased your items</p>
	</div>

	{#if loading}
		<div class="space-y-4">
			{#each Array(3) as _}
				<div class="bg-white rounded-lg border p-6 animate-pulse">
					<div class="flex space-x-4">
						<div class="w-20 h-20 bg-gray-200 rounded-lg"></div>
						<div class="flex-1 space-y-2">
							<div class="h-5 bg-gray-200 rounded w-1/2"></div>
							<div class="h-4 bg-gray-200 rounded w-1/4"></div>
							<div class="h-4 bg-gray-200 rounded w-1/3"></div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if orders.length === 0}
		<div class="text-center py-12 bg-white rounded-lg border">
			<Package class="w-12 h-12 text-gray-400 mx-auto mb-4" />
			<h3 class="text-lg font-medium text-gray-900 mb-2">No orders yet</h3>
			<p class="text-gray-600 mb-6">When buyers purchase your items, their orders will appear here</p>
			<a href="/sell/new" class="btn-primary">Create Your First Listing</a>
		</div>
	{:else}
		<div class="space-y-6">
			{#each orders as order}
				<div class="bg-white rounded-lg border overflow-hidden hover:shadow-md transition-shadow">
					<div class="p-6">
						<div class="flex items-start justify-between mb-4">
							<div class="flex items-start space-x-4">
								<!-- Listing Image -->
								<div class="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
									<img
										src={getListingImage(order.listings)}
										alt={order.listings?.title}
										class="w-full h-full object-cover"
									/>
								</div>

								<!-- Order Details -->
								<div class="flex-1">
									<h3 class="font-semibold text-gray-900 mb-1">
										{order.listings?.title || 'Listing Unavailable'}
									</h3>
									<p class="text-sm text-gray-600 mb-2">
										Buyer: {order.users?.legal_name || 'Anonymous Buyer'}
									</p>
									<div class="flex items-center space-x-4 text-sm text-gray-600">
										<span>Order #{order.id.slice(-8)}</span>
										<span>•</span>
										<span>{formatDate(order.created_at)}</span>
										<span>•</span>
										<span class="font-medium text-gray-900">{formatPrice(order.amount_cents)}</span>
									</div>
								</div>
							</div>

							<!-- Status Badge -->
							<div class="flex items-center space-x-2">
								<div class={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${getOrderStatusClass(order.state)}`}>
									<svelte:component 
										this={getOrderStatusIcon(order.state)} 
										class="w-4 h-4 mr-2" 
									/>
									{order.state.replace('_', ' ').toUpperCase()}
								</div>
							</div>
						</div>

						<!-- Action Buttons -->
						<div class="flex items-center justify-between pt-4 border-t border-gray-100">
							<div class="flex space-x-3">
								<a
									href="/orders/{order.id}"
									class="btn-secondary text-sm"
								>
									View Details
								</a>
								
								{#if order.state === 'paid'}
									<button class="btn-primary text-sm">
										Mark Ready for Pickup
									</button>
								{/if}
								
								{#if order.state === 'ready_for_handover'}
									<button class="btn-primary text-sm">
										Mark as Shipped
									</button>
								{/if}
							</div>

							<div class="text-sm text-gray-500">
								{#if order.state === 'pending'}
									Awaiting payment from buyer
								{:else if order.state === 'paid'}
									Payment received - prepare for handover
								{:else if order.state === 'ready_for_handover'}
									Ready for buyer pickup
								{:else if order.state === 'shipped'}
									Item shipped to buyer
								{:else if order.state === 'delivered'}
									Successfully delivered
								{:else if order.state === 'released'}
									Payment released - transaction complete
								{:else}
									{order.state}
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>