<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import { 
		getOrderDetails, 
		updateOrderState, 
		getOrderStatusColor, 
		getOrderStatusLabel,
		formatPrice,
		canPerformAction,
		subscribeToOrderUpdates
	} from '$lib/orders';
	import { 
		Clock, 
		CheckCircle, 
		Truck, 
		Package, 
		User, 
		MapPin,
		CreditCard,
		AlertCircle,
		ArrowRight
	} from 'lucide-svelte';

	let order: any = null;
	let loading = true;
	let error = '';
	let user: any = null;
	let updating = false;

	$: orderId = $page.params.orderId;

	onMount(async () => {
		// Get user session
		const { data: { session } } = await supabase.auth.getSession();
		user = session?.user || null;

		await loadOrder();

		// Set up real-time subscription for order updates
		if (orderId) {
			const subscription = subscribeToOrderUpdates(orderId, (updatedOrder) => {
				order = updatedOrder;
			});

			return () => {
				subscription.unsubscribe();
			};
		}
	});

	async function loadOrder() {
		try {
			order = await getOrderDetails(orderId);
			if (!order) {
				error = 'Order not found';
			}
		} catch (err) {
			console.error('Error loading order:', err);
			error = 'Failed to load order';
		} finally {
			loading = false;
		}
	}

	async function updateState(newState: string) {
		if (!order || !user) return;

		updating = true;
		try {
			const success = await updateOrderState(order.id, newState);
			if (success) {
				await loadOrder(); // Reload order data
			} else {
				error = 'Failed to update order state';
			}
		} catch (err) {
			console.error('Error updating order state:', err);
			error = 'Failed to update order state';
		} finally {
			updating = false;
		}
	}

	function getMainPhoto(photos: any[]): string {
		if (!photos || photos.length === 0) {
			return '/placeholder-image.jpg';
		}
		const sortedPhotos = photos.sort((a, b) => a.order_idx - b.order_idx);
		return sortedPhotos[0].url;
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

	function isBuyer(): boolean {
		return user && order && order.buyer_id === user.id;
	}

	function isSeller(): boolean {
		return user && order && order.seller_id === user.id;
	}
</script>

<svelte:head>
	<title>Order #{orderId} - Aussie Market</title>
</svelte:head>

{#if loading}
	<div class="flex items-center justify-center h-64">
		<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
	</div>
{:else if error}
	<div class="text-center py-12">
		<AlertCircle class="w-12 h-12 text-red-500 mx-auto mb-4" />
		<h2 class="text-2xl font-bold text-gray-900 mb-4">Order Not Found</h2>
		<p class="text-gray-600 mb-6">{error}</p>
		<a href="/account" class="btn-primary">Back to Account</a>
	</div>
{:else if order}
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-3xl font-bold text-gray-900">Order #{order.id.slice(0, 8)}</h1>
					<p class="text-gray-600 mt-2">
						{formatDate(order.created_at)} • {formatPrice(order.amount_cents)}
					</p>
				</div>
				<div class="text-right">
					<span class="inline-block px-3 py-1 text-sm font-medium rounded-full {getOrderStatusColor(order.state)}">
						{getOrderStatusLabel(order.state)}
					</span>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
			<!-- Main Content -->
			<div class="lg:col-span-2 space-y-6">
				<!-- Order Item -->
				<div class="bg-white rounded-lg shadow-sm border">
					<div class="p-6">
						<div class="flex items-start space-x-4">
							<img
								src={getMainPhoto(order.listings.listing_photos)}
								alt={order.listings.title}
								class="w-20 h-20 object-cover rounded"
							/>
							<div class="flex-1">
								<h3 class="font-medium text-gray-900">{order.listings.title}</h3>
								<p class="text-sm text-gray-500 mt-1">{order.listings.description}</p>
								<div class="mt-2">
									<span class="text-lg font-bold text-gray-900">
										{formatPrice(order.amount_cents)}
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Order Timeline -->
				<div class="bg-white rounded-lg shadow-sm border">
					<div class="p-6">
						<h3 class="text-lg font-medium text-gray-900 mb-4">Order Timeline</h3>
						<div class="space-y-4">
							<div class="flex items-center space-x-3">
								<div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
									<CheckCircle class="w-5 h-5 text-green-600" />
								</div>
								<div class="flex-1">
									<p class="font-medium text-gray-900">Order Created</p>
									<p class="text-sm text-gray-500">{formatDate(order.created_at)}</p>
								</div>
							</div>

							{#if order.state !== 'pending'}
								<div class="flex items-center space-x-3">
									<div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
										<CreditCard class="w-5 h-5 text-blue-600" />
									</div>
									<div class="flex-1">
										<p class="font-medium text-gray-900">Payment Received</p>
										<p class="text-sm text-gray-500">{formatDate(order.updated_at)}</p>
									</div>
								</div>
							{/if}

							{#if ['ready_for_handover', 'shipped', 'delivered', 'released'].includes(order.state)}
								<div class="flex items-center space-x-3">
									<div class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
										<Package class="w-5 h-5 text-purple-600" />
									</div>
									<div class="flex-1">
										<p class="font-medium text-gray-900">Ready for Handover</p>
										<p class="text-sm text-gray-500">Seller marked item as ready</p>
									</div>
								</div>
							{/if}

							{#if ['shipped', 'delivered', 'released'].includes(order.state)}
								<div class="flex items-center space-x-3">
									<div class="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
										<Truck class="w-5 h-5 text-indigo-600" />
									</div>
									<div class="flex-1">
										<p class="font-medium text-gray-900">Shipped</p>
										<p class="text-sm text-gray-500">Item has been shipped</p>
									</div>
								</div>
							{/if}

							{#if ['delivered', 'released'].includes(order.state)}
								<div class="flex items-center space-x-3">
									<div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
										<CheckCircle class="w-5 h-5 text-green-600" />
									</div>
									<div class="flex-1">
										<p class="font-medium text-gray-900">Delivered</p>
										<p class="text-sm text-gray-500">Item has been delivered</p>
									</div>
								</div>
							{/if}

							{#if order.state === 'released'}
								<div class="flex items-center space-x-3">
									<div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
										<CheckCircle class="w-5 h-5 text-green-600" />
									</div>
									<div class="flex-1">
										<p class="font-medium text-gray-900">Funds Released</p>
										<p class="text-sm text-gray-500">Payment released to seller</p>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Order Actions -->
				{#if user && (isBuyer() || isSeller())}
					<div class="bg-white rounded-lg shadow-sm border">
						<div class="p-6">
							<h3 class="text-lg font-medium text-gray-900 mb-4">Order Actions</h3>
							
							{#if isBuyer()}
								<!-- Buyer Actions -->
								<div class="space-y-3">
									{#if canPerformAction(order, user.id, 'pay')}
										<a href="/orders/{order.id}/pay" class="btn-primary w-full">
											<CreditCard class="w-4 h-4 mr-2" />
											Pay Now
										</a>
									{/if}

									{#if canPerformAction(order, user.id, 'confirm_delivery')}
										<button
											on:click={() => updateState('delivered')}
											disabled={updating}
											class="btn btn-outline w-full"
										>
											<CheckCircle class="w-4 h-4 mr-2" />
											{updating ? 'Confirming...' : 'Confirm Delivery'}
										</button>
									{/if}

									{#if canPerformAction(order, user.id, 'release_funds')}
										<button
											on:click={() => updateState('released')}
											disabled={updating}
											class="btn btn-outline w-full"
										>
											<CheckCircle class="w-4 h-4 mr-2" />
											{updating ? 'Releasing...' : 'Release Funds to Seller'}
										</button>
									{/if}
								</div>
							{:else if isSeller()}
								<!-- Seller Actions -->
								<div class="space-y-3">
									{#if canPerformAction(order, user.id, 'mark_ready')}
										<button
											on:click={() => updateState('ready_for_handover')}
											disabled={updating}
											class="btn-primary w-full"
										>
											<Package class="w-4 h-4 mr-2" />
											{updating ? 'Marking...' : 'Mark as Ready for Handover'}
										</button>
									{/if}

									{#if canPerformAction(order, user.id, 'mark_shipped')}
										<button
											on:click={() => updateState('shipped')}
											disabled={updating}
											class="btn btn-outline w-full"
										>
											<Truck class="w-4 h-4 mr-2" />
											{updating ? 'Marking...' : 'Mark as Shipped'}
										</button>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Sidebar -->
			<div class="lg:col-span-1 space-y-6">
				<!-- Order Summary -->
				<div class="bg-white rounded-lg shadow-sm border">
					<div class="p-6">
						<h3 class="text-lg font-medium text-gray-900 mb-4">Order Summary</h3>
						<dl class="space-y-3">
							<div class="flex justify-between">
								<dt class="text-gray-600">Order ID:</dt>
								<dd class="font-medium">{order.id.slice(0, 8)}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-gray-600">Total Amount:</dt>
								<dd class="font-bold text-lg">{formatPrice(order.amount_cents)}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-gray-600">Status:</dt>
								<dd class="font-medium">
									<span class="inline-block px-2 py-1 text-xs font-medium rounded {getOrderStatusColor(order.state)}">
										{getOrderStatusLabel(order.state)}
									</span>
								</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-gray-600">Created:</dt>
								<dd class="font-medium">{formatDate(order.created_at)}</dd>
							</div>
							{#if order.updated_at !== order.created_at}
								<div class="flex justify-between">
									<dt class="text-gray-600">Last Updated:</dt>
									<dd class="font-medium">{formatDate(order.updated_at)}</dd>
								</div>
							{/if}
						</dl>
					</div>
				</div>

				<!-- Contact Information -->
				<div class="bg-white rounded-lg shadow-sm border">
					<div class="p-6">
						<h3 class="text-lg font-medium text-gray-900 mb-4">Contact Information</h3>
						
						{#if isBuyer()}
							<!-- Show seller info to buyer -->
							<div class="space-y-3">
								<div class="flex items-center space-x-2">
									<User class="w-4 h-4 text-gray-400" />
									<span class="text-sm font-medium text-gray-900">Seller</span>
								</div>
								<div class="pl-6">
									<p class="font-medium text-gray-900">{order.seller.legal_name}</p>
									<p class="text-sm text-gray-500">{order.seller.email}</p>
								</div>
							</div>
						{:else if isSeller()}
							<!-- Show buyer info to seller -->
							<div class="space-y-3">
								<div class="flex items-center space-x-2">
									<User class="w-4 h-4 text-gray-400" />
									<span class="text-sm font-medium text-gray-900">Buyer</span>
								</div>
								<div class="pl-6">
									<p class="font-medium text-gray-900">{order.buyer.legal_name}</p>
									<p class="text-sm text-gray-500">{order.buyer.email}</p>
								</div>
							</div>
						{/if}

						<div class="mt-4 pt-4 border-t border-gray-200">
							<a href="/messages/new?orderId={order.id}" class="btn btn-outline w-full">
								Send Message
							</a>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
