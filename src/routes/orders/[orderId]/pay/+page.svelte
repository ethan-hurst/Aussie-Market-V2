<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import { getOrderDetails, formatPrice } from '$lib/orders';
	import { 
		CreditCard, 
		Lock, 
		Shield, 
		CheckCircle,
		AlertCircle,
		ArrowLeft
	} from 'lucide-svelte';

	let order: any = null;
	let loading = true;
	let processing = false;
	let error = '';
	let success = '';
	let user: any = null;
	let clientSecret = '';
	let paymentIntentId = '';

	$: orderId = $page.params.orderId;

	onMount(async () => {
		// Get user session
		const { data: { session } } = await supabase.auth.getSession();
		user = session?.user || null;

		if (!user) {
			goto('/login');
			return;
		}

		await loadOrder();
	});

	async function loadOrder() {
		try {
			order = await getOrderDetails(orderId);
			if (!order) {
				error = 'Order not found';
				loading = false;
				return;
			}

			// Check if user is the buyer
			if (order.buyer_id !== user.id) {
				error = 'You are not authorized to pay for this order';
				loading = false;
				return;
			}

			// Check if order is in pending state
			if (order.state !== 'pending') {
				error = 'This order cannot be paid for';
				loading = false;
				return;
			}

			// Create payment intent
			await createPaymentIntent();
		} catch (err) {
			console.error('Error loading order:', err);
			error = 'Failed to load order';
		} finally {
			loading = false;
		}
	}

	async function createPaymentIntent() {
		try {
			const response = await fetch('/api/payments/create-intent', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					orderId: order.id,
					amount: order.amount_cents,
					currency: 'aud'
				})
			});

			if (!response.ok) {
				throw new Error('Failed to create payment intent');
			}

			const data = await response.json();
			clientSecret = data.clientSecret;
			paymentIntentId = data.paymentIntentId;
		} catch (err) {
			console.error('Error creating payment intent:', err);
			error = 'Failed to initialize payment';
		}
	}

	async function handlePayment() {
		if (!clientSecret) {
			error = 'Payment not initialized';
			return;
		}

		processing = true;
		error = '';

		try {
			// Here you would integrate with Stripe Elements or other payment UI
			// For now, we'll simulate a successful payment
			await simulatePayment();
		} catch (err) {
			console.error('Payment error:', err);
			error = 'Payment failed. Please try again.';
		} finally {
			processing = false;
		}
	}

	async function simulatePayment() {
		// Simulate payment processing
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Confirm payment
		const response = await fetch('/api/payments/confirm', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				orderId: order.id,
				paymentIntentId: paymentIntentId
			})
		});

		if (!response.ok) {
			throw new Error('Failed to confirm payment');
		}

		success = 'Payment successful!';
		setTimeout(() => {
			goto(`/orders/${order.id}`);
		}, 2000);
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
	<title>Pay for Order - Aussie Market</title>
</svelte:head>

{#if loading}
	<div class="flex items-center justify-center h-64">
		<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
	</div>
{:else if error}
	<div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<div class="text-center">
			<AlertCircle class="w-12 h-12 text-red-500 mx-auto mb-4" />
			<h2 class="text-2xl font-bold text-gray-900 mb-4">Payment Error</h2>
			<p class="text-gray-600 mb-6">{error}</p>
			<a href="/orders/{orderId}" class="btn-primary">Back to Order</a>
		</div>
	</div>
{:else if success}
	<div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<div class="text-center">
			<CheckCircle class="w-12 h-12 text-green-500 mx-auto mb-4" />
			<h2 class="text-2xl font-bold text-gray-900 mb-4">Payment Successful!</h2>
			<p class="text-gray-600 mb-6">{success}</p>
			<p class="text-sm text-gray-500">Redirecting to order details...</p>
		</div>
	</div>
{:else if order}
	<div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<!-- Header -->
		<div class="mb-8">
			<a href="/orders/{order.id}" class="inline-flex items-center text-sm text-primary-600 hover:text-primary-500 mb-4">
				<ArrowLeft class="w-4 h-4 mr-1" />
				Back to Order
			</a>
			<h1 class="text-3xl font-bold text-gray-900">Complete Payment</h1>
			<p class="text-gray-600 mt-2">Secure payment for your order</p>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
			<!-- Payment Form -->
			<div class="space-y-6">
				<!-- Order Summary -->
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<h3 class="text-lg font-medium text-gray-900 mb-4">Order Summary</h3>
					<div class="flex items-start space-x-4">
						<img
							src={getMainPhoto(order.listings.listing_photos)}
							alt={order.listings.title}
							class="w-16 h-16 object-cover rounded"
						/>
						<div class="flex-1">
							<h4 class="font-medium text-gray-900">{order.listings.title}</h4>
							<p class="text-sm text-gray-500 mt-1">{order.listings.description}</p>
						</div>
					</div>
					<div class="mt-4 pt-4 border-t border-gray-200">
						<div class="flex justify-between items-center">
							<span class="text-lg font-medium text-gray-900">Total Amount:</span>
							<span class="text-2xl font-bold text-gray-900">{formatPrice(order.amount_cents)}</span>
						</div>
					</div>
				</div>

				<!-- Payment Form -->
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<h3 class="text-lg font-medium text-gray-900 mb-4">Payment Details</h3>
					
					{#if error}
						<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
							<p class="text-sm text-red-700">{error}</p>
						</div>
					{/if}

					<div class="space-y-4">
						<!-- Card Number -->
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-2">
								Card Number
							</label>
							<div class="relative">
								<CreditCard class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
								<input
									type="text"
									placeholder="1234 5678 9012 3456"
									class="input pl-10 w-full"
									disabled
								/>
							</div>
						</div>

						<div class="grid grid-cols-2 gap-4">
							<!-- Expiry Date -->
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">
									Expiry Date
								</label>
								<input
									type="text"
									placeholder="MM/YY"
									class="input w-full"
									disabled
								/>
							</div>

							<!-- CVC -->
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">
									CVC
								</label>
								<input
									type="text"
									placeholder="123"
									class="input w-full"
									disabled
								/>
							</div>
						</div>

						<!-- Payment Button -->
						<button
							on:click={handlePayment}
							disabled={processing || !clientSecret}
							class="w-full btn-primary py-3"
						>
							{#if processing}
								<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>
								<span class="ml-2">Processing Payment...</span>
							{:else}
								<CreditCard class="w-5 h-5 mr-2" />
								Pay {formatPrice(order.amount_cents)}
							{/if}
						</button>

						<p class="text-xs text-gray-500 text-center">
							Your payment is secured by Stripe
						</p>
					</div>
				</div>
			</div>

			<!-- Security Info -->
			<div class="space-y-6">
				<!-- Security Features -->
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<h3 class="text-lg font-medium text-gray-900 mb-4">Security & Protection</h3>
					<div class="space-y-4">
						<div class="flex items-start space-x-3">
							<Shield class="w-5 h-5 text-green-600 mt-0.5" />
							<div>
								<p class="font-medium text-gray-900">Secure Payment</p>
								<p class="text-sm text-gray-500">All payments are encrypted and secure</p>
							</div>
						</div>
						<div class="flex items-start space-x-3">
							<Lock class="w-5 h-5 text-green-600 mt-0.5" />
							<div>
								<p class="font-medium text-gray-900">Buyer Protection</p>
								<p class="text-sm text-gray-500">Your payment is held until you receive the item</p>
							</div>
						</div>
						<div class="flex items-start space-x-3">
							<CheckCircle class="w-5 h-5 text-green-600 mt-0.5" />
							<div>
								<p class="font-medium text-gray-900">Verified Seller</p>
								<p class="text-sm text-gray-500">Seller has been verified by our platform</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Order Details -->
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<h3 class="text-lg font-medium text-gray-900 mb-4">Order Information</h3>
					<dl class="space-y-3">
						<div class="flex justify-between">
							<dt class="text-gray-600">Order ID:</dt>
							<dd class="font-medium">{order.id.slice(0, 8)}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-gray-600">Seller:</dt>
							<dd class="font-medium">{order.seller.legal_name}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-gray-600">Item:</dt>
							<dd class="font-medium">{order.listings.title}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-gray-600">Amount:</dt>
							<dd class="font-bold">{formatPrice(order.amount_cents)}</dd>
						</div>
					</dl>
				</div>
			</div>
		</div>
	</div>
{/if}
