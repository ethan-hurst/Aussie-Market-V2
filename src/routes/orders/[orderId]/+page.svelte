<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import { 
		getOrderDetails, 
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
		ArrowRight,
		KeyRound,
		QrCode,
		Copy,
		ArrowLeft,
		ArrowUp,
		ArrowDown
	} from 'lucide-svelte';

	let order: any = null;
	let loading = true;
	let error = '';
	let user: any = null;
	let updating = false;

	// Pickup UI state
	let pickupCode = '';
	let pickupToken = '';
	let pickupLoading = false;
	let pickupMessage = '';
	let pickupErrorMsg = '';
	let redeemCode = '';
	let redeemLoading = false;
	let qrDataUrl = '';

	// Shipping form state
	let shipCarrier = '';
	let shipTracking = '';
	let shipLabelUrl = '';
	let shipLoading = false;
	let shipMsg = '';
	let shipErr = '';

	// Shipment events
	let shipmentEvents: Array<{ id: string; status: string; description?: string; location?: string; event_time: string }> = [];
	let newEventStatus = '';
	let newEventDesc = '';
	let newEventLocation = '';
	let eventLoading = false;

	async function copyText(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			pickupMessage = 'Copied to clipboard';
			setTimeout(() => (pickupMessage = ''), 2000);
		} catch (e) {
			pickupErrorMsg = 'Copy failed';
			setTimeout(() => (pickupErrorMsg = ''), 2000);
		}
	}

	let orderId: string;
	$: orderId = $page.params.orderId as string;
	let orderSubscription: { unsubscribe?: () => void } | null = null;

	onMount(async () => {
		// Get user session
		const { data: { session } } = await supabase.auth.getSession();
		user = session?.user || null;

		await loadOrder();
		await loadShipmentEvents();

		// Set up real-time subscription for order updates
		if (orderId) {
			orderSubscription = subscribeToOrderUpdates(orderId, (updatedOrder) => {
				order = updatedOrder;
			});
		}
	});

	onDestroy(() => {
		if (orderSubscription && typeof orderSubscription.unsubscribe === 'function') {
			orderSubscription.unsubscribe();
		}
	});

	async function loadOrder() {
		try {
			if (!orderId) return;
			order = await getOrderDetails(orderId as string);
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

	function actionForState(state: string): string | null {
		switch (state) {
			case 'ready_for_handover':
				return 'mark_ready';
			case 'shipped':
				return 'mark_shipped';
			case 'delivered':
				return 'confirm_delivery';
			case 'released':
				return 'release_funds';
			default:
				return null;
		}
	}

	async function performAction(action: string) {
		updating = true;
		try {
			const res = await fetch(`/api/orders/${order.id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action })
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body?.error || 'Failed to perform action');
			}

			await loadOrder();
		} catch (err) {
			console.error('Order action failed:', err);
			error = 'Failed to update order state';
		} finally {
			updating = false;
		}
	}

	async function updateState(newState: string) {
		if (!order || !user) return;
		const action = actionForState(newState);
		if (!action) return;
		await performAction(action);
	}

	async function initPickup() {
		try {
			pickupLoading = true;
			pickupErrorMsg = '';
			pickupMessage = '';
			const res = await fetch(`/api/pickup/${order.id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'init' })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'Failed to initialize pickup');
			pickupCode = data.code6;
			pickupToken = data.qr_token;
			pickupMessage = 'Pickup code generated. Share this code with the buyer at handover.';
			// Build QR for token if available
			try {
				const mod = await import('qrcode');
				const QRCode = mod.default || mod;
				qrDataUrl = await QRCode.toDataURL(pickupToken);
			} catch (e) {
				console.warn('QR generation failed', e);
			}
		} catch (e) {
			pickupErrorMsg = (e as Error).message || 'Failed to initialize pickup';
		} finally {
			pickupLoading = false;
		}
	}

	async function redeemPickup() {
		try {
			redeemLoading = true;
			pickupErrorMsg = '';
			pickupMessage = '';
			if (!redeemCode) throw new Error('Enter the 6-digit code');
			const res = await fetch(`/api/pickup/${order.id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'redeem', code6: redeemCode })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'Failed to redeem pickup');
			pickupMessage = 'Pickup confirmed.';
			await loadOrder();
		} catch (e) {
			pickupErrorMsg = (e as Error).message || 'Failed to redeem pickup';
		} finally {
			redeemLoading = false;
		}
	}

	async function saveShipment() {
		try {
			shipLoading = true;
			shipErr = '';
			shipMsg = '';
			if (!shipCarrier || !shipTracking) throw new Error('Carrier and tracking required');
			const res = await fetch(`/api/shipments/${order.id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ carrier: shipCarrier, tracking: shipTracking, label_url: shipLabelUrl })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'Failed to save shipment');
			shipMsg = 'Shipment saved.';
			await loadOrder();
		} catch (e) {
			shipErr = (e as Error).message || 'Failed to save shipment';
		} finally {
			shipLoading = false;
		}
	}

	async function loadShipmentEvents() {
		try {
			if (!orderId) return;
			const res = await fetch(`/api/shipments/${orderId}/events`);
			const data = await res.json();
			shipmentEvents = data?.events || [];
		} catch (e) {
			console.warn('Failed to load events');
		}
	}

	async function addShipmentEvent() {
		try {
			eventLoading = true;
			const res = await fetch(`/api/shipments/${orderId}/events`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: newEventStatus, description: newEventDesc, location: newEventLocation })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'Failed to add event');
			newEventStatus = '';
			newEventDesc = '';
			newEventLocation = '';
			await loadShipmentEvents();
			await loadOrder();
		} catch (e) {
			console.error(e);
		} finally {
			eventLoading = false;
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

								<!-- Buyer Pickup Redeem -->
								{#if isBuyer() && (order.state === 'ready_for_handover' || order.state === 'shipped')}
									<div class="mt-6 p-4 border rounded-md bg-gray-50">
										<h4 class="text-sm font-semibold text-gray-900 mb-3 flex items-center"><QrCode class="w-4 h-4 mr-2"/> Redeem Pickup</h4>
										{#if pickupMessage}
											<p class="text-sm text-green-700 mb-2">{pickupMessage}</p>
										{/if}
										{#if pickupErrorMsg}
											<p class="text-sm text-red-700 mb-2">{pickupErrorMsg}</p>
										{/if}
										<div class="flex items-center space-x-2">
											<input class="input" placeholder="Enter 6-digit code" bind:value={redeemCode} maxlength="6" />
											<button class="btn btn-outline" on:click={redeemPickup} disabled={redeemLoading}>
												{redeemLoading ? 'Confirming...' : 'Confirm Pickup'}
											</button>
										</div>
									</div>
								{/if}
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

								<!-- Seller Pickup Management -->
								{#if isSeller() && (order.state === 'paid' || order.state === 'ready_for_handover')}
									<div class="mt-6 p-4 border rounded-md bg-gray-50">
										<h4 class="text-sm font-semibold text-gray-900 mb-3 flex items-center"><KeyRound class="w-4 h-4 mr-2"/> Pickup Code</h4>
										{#if pickupMessage}
											<p class="text-sm text-green-700 mb-2">{pickupMessage}</p>
										{/if}
										{#if pickupErrorMsg}
											<p class="text-sm text-red-700 mb-2">{pickupErrorMsg}</p>
										{/if}
										<div class="flex items-center space-x-2">
											<button class="btn btn-outline" on:click={initPickup} disabled={pickupLoading}>
												{pickupLoading ? 'Generating...' : 'Generate Code'}
											</button>
											{#if pickupCode}
												<span class="ml-2 font-mono text-lg">{pickupCode}</span>
												<button class="ml-2 text-sm text-primary-600 hover:underline" on:click={() => copyText(pickupCode)}>
													<Copy class="w-4 h-4 inline-block mr-1" /> Copy
												</button>
											{/if}
										</div>
										{#if pickupToken}
											<div class="mt-2 text-xs text-gray-500 break-all">Token: {pickupToken}</div>
											{#if qrDataUrl}
												<div class="mt-3">
													<img src={qrDataUrl} alt="Pickup QR" class="w-32 h-32 border rounded" />
													<a class="text-sm text-primary-600 hover:underline block mt-1" href={qrDataUrl} download={`pickup-${order.id}.png`}>Download QR</a>
												</div>
											{/if}
										{/if}
									</div>
								{/if}

								<!-- Seller Manual Shipping Form -->
								{#if isSeller() && (order.state === 'ready_for_handover' || order.state === 'paid')}
									<div class="mt-6 p-4 border rounded-md bg-gray-50">
										<h4 class="text-sm font-semibold text-gray-900 mb-3 flex items-center"><Truck class="w-4 h-4 mr-2"/> Add Shipping Details</h4>
										{#if shipMsg}
											<p class="text-sm text-green-700 mb-2">{shipMsg}</p>
										{/if}
										{#if shipErr}
											<p class="text-sm text-red-700 mb-2">{shipErr}</p>
										{/if}
										<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
											<input class="input" placeholder="Carrier (e.g. AusPost)" bind:value={shipCarrier} />
											<input class="input" placeholder="Tracking number" bind:value={shipTracking} />
											<input class="input" placeholder="Label URL (optional)" bind:value={shipLabelUrl} />
										</div>
										<div class="mt-3">
											<button class="btn btn-outline" disabled={shipLoading} on:click={saveShipment}>
												{shipLoading ? 'Saving...' : 'Save & Mark Shipped'}
											</button>
										</div>
									</div>
								{/if}

								<!-- Shipping Timeline -->
								{#if shipmentEvents.length > 0}
									<div class="mt-6 p-4 border rounded-md bg-white">
										<h4 class="text-sm font-semibold text-gray-900 mb-3">Shipping Timeline</h4>
										<ul class="space-y-2">
											{#each shipmentEvents as ev}
												<li class="text-sm">
													<span class="font-medium">{ev.status}</span>
													<span class="text-gray-500 ml-2">{new Date(ev.event_time).toLocaleString()}</span>
													{#if ev.location}
														<span class="text-gray-500 ml-2">• {ev.location}</span>
													{/if}
													{#if ev.description}
														<div class="text-gray-700">{ev.description}</div>
													{/if}
												</li>
											{/each}
										</ul>
									</div>
								{/if}

								<!-- Seller add timeline event -->
								{#if isSeller() && (order.state === 'shipped' || order.state === 'delivered')}
									<div class="mt-4 p-4 border rounded-md bg-gray-50">
										<h4 class="text-sm font-semibold text-gray-900 mb-3">Add Tracking Event</h4>
										<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
											<input class="input" placeholder="Status (e.g. in_transit)" bind:value={newEventStatus} />
											<input class="input" placeholder="Location (optional)" bind:value={newEventLocation} />
											<input class="input" placeholder="Description (optional)" bind:value={newEventDesc} />
										</div>
										<div class="mt-3">
											<button class="btn btn-outline" disabled={eventLoading} on:click={addShipmentEvent}>
												{eventLoading ? 'Adding...' : 'Add Event'}
											</button>
										</div>
									</div>
								{/if}
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
