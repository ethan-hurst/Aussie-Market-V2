<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { Package, Truck, CheckCircle, Clock, AlertCircle } from 'lucide-svelte';

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
					)
				`)
				.eq('buyer_id', user.id)
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

	function formatPrice(cents: number): string {
		return new Intl.NumberFormat('en-AU', {
			style: 'currency',
			currency: 'AUD'
		}).format(cents / 100);
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-AU');
	}

	function getStateIcon(state: string) {
		switch (state) {
			case 'pending':
				return Clock;
			case 'paid':
				return CheckCircle;
			case 'ready_for_handover':
				return Package;
			case 'shipped':
				return Truck;
			case 'delivered':
				return CheckCircle;
			case 'released':
				return CheckCircle;
			default:
				return AlertCircle;
		}
	}

	function getStateColor(state: string): string {
		switch (state) {
			case 'pending':
				return 'text-warning-600 bg-warning-50';
			case 'paid':
				return 'text-success-600 bg-success-50';
			case 'ready_for_handover':
				return 'text-primary-600 bg-primary-50';
			case 'shipped':
				return 'text-primary-600 bg-primary-50';
			case 'delivered':
				return 'text-success-600 bg-success-50';
			case 'released':
				return 'text-success-600 bg-success-50';
			case 'refunded':
				return 'text-error-600 bg-error-50';
			case 'cancelled':
				return 'text-gray-600 bg-gray-50';
			default:
				return 'text-gray-600 bg-gray-50';
		}
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
	<title>My Orders - Aussie Market</title>
</svelte:head>

<div class="max-w-6xl mx-auto space-y-8">
	<!-- Header -->
	<div>
		<h1 class="text-3xl font-bold text-gray-900">My Orders</h1>
		<p class="text-gray-600 mt-2">Track your purchases and manage your orders</p>
	</div>

	{#if loading}
		<div class="flex items-center justify-center h-64">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
		</div>
	{:else if orders.length === 0}
		<div class="text-center py-12">
			<Package class="mx-auto h-12 w-12 text-gray-400" />
			<h3 class="mt-2 text-sm font-medium text-gray-900">No orders yet</h3>
			<p class="mt-1 text-sm text-gray-500">Start bidding on items to see your orders here.</p>
			<div class="mt-6">
				<a href="/" class="btn-primary">Browse Listings</a>
			</div>
		</div>
	{:else}
		<div class="space-y-6">
			{#each orders as order}
				<div class="card">
					<div class="p-6">
						<div class="flex items-start space-x-4">
							<!-- Item Image -->
							<div class="flex-shrink-0">
								<img
									src={getMainPhoto(order.listings?.listing_photos || [])}
									alt={order.listings?.title}
									class="w-20 h-20 object-cover rounded-lg"
								/>
							</div>

							<!-- Order Details -->
							<div class="flex-1 min-w-0">
								<div class="flex items-start justify-between">
									<div>
										<h3 class="text-lg font-medium text-gray-900">
											{order.listings?.title || 'Item'}
										</h3>
										<p class="text-sm text-gray-500">
											Order #{order.id.slice(0, 8)}
										</p>
									</div>
									<div class="text-right">
										<p class="text-lg font-medium text-gray-900">
											{formatPrice(order.amount_cents)}
										</p>
										<p class="text-sm text-gray-500">
											{formatDate(order.created_at)}
										</p>
									</div>
								</div>

								<!-- Order Status -->
								<div class="mt-4 flex items-center justify-between">
									<div class="flex items-center space-x-2">
										{@const StateIcon = getStateIcon(order.state)}
										<StateIcon class="w-5 h-5 text-gray-400" />
										<span class="px-2 py-1 text-sm font-medium rounded-md {getStateColor(order.state)}">
											{order.state.replace('_', ' ').toUpperCase()}
										</span>
									</div>

									<div class="flex space-x-2">
										<a href="/orders/buyer/{order.id}" class="btn btn-outline btn-sm">
											View Details
										</a>
										{#if order.state === 'ready_for_handover'}
											<a href="/orders/buyer/{order.id}/pickup" class="btn-primary btn-sm">
												Pickup Details
											</a>
										{:else if order.state === 'shipped'}
											<a href="/orders/buyer/{order.id}/tracking" class="btn-primary btn-sm">
												Track Package
											</a>
										{/if}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
