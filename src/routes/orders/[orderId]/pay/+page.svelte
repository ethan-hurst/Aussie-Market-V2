<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { loadStripe } from '@stripe/stripe-js';
	import type { OrderWithDetails } from '$lib/orders';
	import { formatPrice, getOrderStatusLabel } from '$lib/orders';
import { mapApiErrorToMessage } from '$lib/errors';
import { toastError, toastSuccess } from '$lib/toast';
import { safeFetch } from '$lib/http';

	let order: OrderWithDetails | null = null;
	let loading = true;
	let processing = false;
	let error = '';
	let stripe: any = null;
	let elements: any = null;
	let cardElement: any = null;

	onMount(async () => {
		try {
			// Load Stripe
			stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_your_stripe_publishable_key_here');
			
			// Load order details
			const response = await safeFetch(`/api/orders/${$page.params.orderId}`);
			order = await response.json();
			
			// Initialize Stripe Elements
			elements = stripe.elements();
			cardElement = elements.create('card', {
				style: {
					base: {
						fontSize: '16px',
						color: '#424770',
						'::placeholder': {
							color: '#aab7c4'
						}
					},
					invalid: {
						color: '#9e2146'
					}
				}
			});
			cardElement.mount('#card-element');
			
		} catch (err) {
			error = mapApiErrorToMessage(err);
			toastError(error);
		} finally {
			loading = false;
		}
	});

	async function handlePayment() {
		if (!order || !stripe || !cardElement) return;
		
		processing = true;
		error = '';
		
		try {
			// Create payment intent
			const intentResponse = await safeFetch('/api/payments/create-intent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					orderId: order.id,
					amount: order.amount_cents,
					currency: 'aud'
				})
			});
			const { clientSecret } = await intentResponse.json();
			
			// Confirm payment
			const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
				payment_method: {
					card: cardElement,
					billing_details: {
						name: order.buyer.legal_name
					}
				}
			});
			
			if (stripeError) {
				throw new Error(stripeError.message);
			}
			
			// Confirm payment on our backend
			const confirmResponse = await safeFetch('/api/payments/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					orderId: order.id,
					paymentIntentId: paymentIntent.id
				})
			});
			
			// Redirect to order details
			goto(`/orders/${order.id}`);
			
		} catch (err) {
			error = mapApiErrorToMessage(err);
			toastError(error);
		} finally {
			processing = false;
		}
	}
</script>

<svelte:head>
	<title>Payment - Order #{$page.params.orderId}</title>
</svelte:head>

<div class="max-w-4xl mx-auto p-6">
	{#if loading}
		<div class="flex justify-center items-center h-64">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
					</svg>
				</div>
				<div class="ml-3">
					<h3 class="text-sm font-medium text-red-800">Error</h3>
					<div class="mt-2 text-sm text-red-700">{error}</div>
				</div>
			</div>
		</div>
	{:else if order}
		<div class="bg-white shadow-lg rounded-lg overflow-hidden">
			<!-- Header -->
			<div class="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
				<div class="flex items-center justify-between">
					<div>
						<h1 class="text-2xl font-bold text-white">Complete Payment</h1>
						<p class="text-blue-100">Order #{order.id.slice(0, 8)}</p>
					</div>
					<div class="text-right">
						<div class="text-3xl font-bold text-white">{formatPrice(order.amount_cents)}</div>
						<div class="text-blue-100">Total Amount</div>
					</div>
				</div>
			</div>

			<div class="p-6">
				<!-- Order Summary -->
				<div class="bg-gray-50 rounded-lg p-4 mb-6">
					<h3 class="text-lg font-semibold text-gray-900 mb-3">Order Summary</h3>
					<div class="space-y-2">
						<div class="flex justify-between">
							<span class="text-gray-600">Item:</span>
							<span class="font-medium">{order.listings.title}</span>
						</div>
						<div class="border-t pt-2">
							<div class="flex justify-between text-lg font-bold">
								<span>Total:</span>
								<span>{formatPrice(order.amount_cents)}</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Payment Form -->
				<form on:submit|preventDefault={handlePayment} class="space-y-6">
					<!-- Card Details -->
					<div>
						<label for="card-element" class="block text-sm font-medium text-gray-700 mb-2">
							Card Information
						</label>
						<div id="card-element" class="border border-gray-300 rounded-md p-3 bg-white"></div>
						<p class="mt-2 text-sm text-gray-500">
							Your payment information is secure and encrypted
						</p>
					</div>

					<!-- Security Notice -->
					<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
						<div class="flex">
							<div class="flex-shrink-0">
								<svg class="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" />
								</svg>
							</div>
							<div class="ml-3">
								<h3 class="text-sm font-medium text-blue-800">Secure Payment</h3>
								<div class="mt-2 text-sm text-blue-700">
									<p>• Your card details are encrypted and secure</p>
									<p>• We never store your full card information</p>
									<p>• Protected by Stripe's industry-leading security</p>
								</div>
							</div>
						</div>
					</div>

					<!-- Buyer Protection -->
					<div class="bg-green-50 border border-green-200 rounded-lg p-4">
						<div class="flex">
							<div class="flex-shrink-0">
								<svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
								</svg>
							</div>
							<div class="ml-3">
								<h3 class="text-sm font-medium text-green-800">Buyer Protection</h3>
								<div class="mt-2 text-sm text-green-700">
									<p>• Secure payment processing</p>
									<p>• Dispute resolution support</p>
									<p>• Money-back guarantee for eligible issues</p>
								</div>
							</div>
						</div>
					</div>

					<!-- Submit Button -->
					<button
						type="submit"
						disabled={processing}
						class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center"
					>
						{#if processing}
							<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Processing Payment...
						{:else}
							Pay {formatPrice(order.amount_cents)}
						{/if}
					</button>
				</form>

				<!-- Cancel Link -->
				<div class="mt-6 text-center">
					<a href="/orders/{order.id}" class="text-blue-600 hover:text-blue-800 text-sm">
						← Back to Order Details
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>
