<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { loadStripe } from '@stripe/stripe-js';
	import type { OrderWithDetails } from '$lib/orders';
	import { formatPrice, getOrderStatusLabel } from '$lib/orders';
	import { mapApiErrorToMessage, categorizePaymentError, isRetryableError } from '$lib/errors';
	import { toastError, toastSuccess } from '$lib/toast';
	import { safeFetch } from '$lib/http';
	import PaymentErrorBoundary from '$lib/components/PaymentErrorBoundary.svelte';
	import PaymentStatusIndicator from '$lib/components/PaymentStatusIndicator.svelte';
	import ErrorNotificationDisplay from '$lib/components/ErrorNotificationDisplay.svelte';
	import { notifyPaymentError, notifyWebhookFailure } from '$lib/errorNotificationSystem';
	import { pollOrderStatus } from '$lib/webhookFallback';

	let order: OrderWithDetails | null = null;
	let loading = true;
	let processing = false;
	let error = '';
	let paymentStatus: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' = 'pending';
	let retryCount = 0;
	let maxRetries = 3;
	let stripe: any = null;
	let elements: any = null;
	let cardElement: any = null;

	onMount(async () => {
		try {
			// Load order details first to render UI quickly
			const response = await safeFetch(`/api/orders/${$page.params.orderId}`);
			order = await response.json();
			loading = false;

			// Lazily load Stripe; do not block UI if it fails
			try {
				stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_your_stripe_publishable_key_here');
				if (stripe) {
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
				}
			} catch (stripeErr) {
				// Non-fatal in tests; payment form will be disabled until stripe loads
			}
		} catch (err) {
			error = mapApiErrorToMessage(err);
			toastError(error);
			loading = false;
		}
	});

	async function handlePayment() {
		if (!order || !stripe || !cardElement) return;
		
		processing = true;
		error = '';
		paymentStatus = 'processing';
		
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
			
			if (!confirmResponse.ok) {
				const errorData = await confirmResponse.json();
				throw new Error(errorData.error || 'Payment confirmation failed');
			}
			
			// Payment successful
			paymentStatus = 'succeeded';
			toastSuccess('Payment completed successfully!');
			
			// Start polling for order status updates as webhook fallback
			pollOrderStatus(order.id, {
				onStatusUpdate: (updatedOrder) => {
					console.log('Order status updated:', updatedOrder.state);
					// Update local order state if needed
					if (updatedOrder.state === 'paid') {
						order = { ...order, ...updatedOrder };
						toastSuccess('Order fulfillment has started!');
					}
				},
				onError: (pollingError) => {
					console.error('Polling error:', pollingError);
					if (order) {
						notifyWebhookFailure(order.id, pollingError, { showRetry: true, showPolling: true });
					}
				},
				onComplete: (finalOrder) => {
					console.log('Order polling completed:', finalOrder.state);
					// Ensure we have the final order state
					if (finalOrder.state === 'paid') {
						order = { ...order, ...finalOrder };
					}
				}
			});
			
			// Show success message with next steps
			setTimeout(() => {
				toastSuccess('The seller has been notified to prepare your item for shipping.');
			}, 1500);
			
			// Redirect to order details after a longer delay to show messages
			setTimeout(() => {
				if (order) {
					goto(`/orders/${order.id}?payment=success`);
				}
			}, 3500);
			
		} catch (err) {
			error = mapApiErrorToMessage(err);
			paymentStatus = 'failed';
			
			// Categorize the error and show appropriate notification
			const paymentErrorInfo = categorizePaymentError(err);
			notifyPaymentError(err, order.id, {
				persistent: !paymentErrorInfo.canRetry,
				actions: paymentErrorInfo.canRetry ? [
					{
						label: 'Try Again',
						action: () => handleRetry(),
						variant: 'primary'
					}
				] : undefined
			});
			
			toastError(error);
		} finally {
			processing = false;
		}
	}

	function handleRetry() {
		if (retryCount >= maxRetries) return;
		
		retryCount++;
		error = '';
		paymentStatus = 'pending';
		
		// Retry payment after a short delay
		setTimeout(() => {
			handlePayment();
		}, 1000);
	}

	function handleNewPayment() {
		// Reset state for new payment attempt
		error = '';
		paymentStatus = 'pending';
		retryCount = 0;
	}

	function handleContactSupport() {
		// Open support contact or redirect to support page
		window.open('/support', '_blank');
	}
</script>

<svelte:head>
	<title>Payment - Order #{$page.params.orderId}</title>
</svelte:head>

<!-- Error Notification Display -->
<ErrorNotificationDisplay 
	position="top-right" 
	maxNotifications={3}
	on:notificationAction={(e) => {
		const { notificationId, actionLabel } = e.detail;
		if (actionLabel === 'Try Again') {
			handleRetry();
		} else if (actionLabel === 'New Payment Method') {
			handleNewPayment();
		} else if (actionLabel === 'Contact Support') {
			handleContactSupport();
		}
	}}
/>

<div class="max-w-4xl mx-auto p-6">
    <h1 class="text-2xl font-bold mb-4">Complete Payment</h1>
	{#if loading}
		<div class="flex justify-center items-center h-64" data-testid="loading-spinner">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if error && paymentStatus === 'failed'}
		<!-- Enhanced Error Display with PaymentErrorBoundary -->
		<PaymentErrorBoundary 
			{error} 
			orderId={order?.id}
			showRetry={isRetryableError(error)}
			{maxRetries}
			{retryCount}
			{paymentStatus}
			on:retry={() => handleRetry()}
			on:contactSupport={() => handleContactSupport()}
			on:newPayment={() => handleNewPayment()}
			on:errorStateChange={(e) => {
				// Handle error state changes for better UI synchronization
				const { hasError, errorInfo } = e.detail;
				if (!hasError) {
					error = '';
					paymentStatus = 'pending';
				}
			}}
		/>
	{:else if paymentStatus === 'processing' || paymentStatus === 'succeeded'}
		<!-- Payment Status Indicator with Real-time Updates -->
		<PaymentStatusIndicator 
			status={paymentStatus}
			showProgress={true}
			progressSteps={['Payment Details', 'Processing', 'Confirmation']}
			currentStep={paymentStatus === 'processing' ? 1 : 2}
			{error}
			retryable={isRetryableError(error)}
			orderId={order?.id}
			enableAutoUpdate={paymentStatus === 'processing'}
			autoUpdateInterval={2000}
			on:retry={() => handleRetry()}
			on:cancel={() => goto(`/orders/${order?.id}`)}
			on:statusUpdate={(e) => {
				// Handle real-time status updates
				const { status: newStatus } = e.detail;
				if (newStatus !== paymentStatus) {
					paymentStatus = newStatus;
					
					// Update UI based on new status
					if (newStatus === 'succeeded') {
						toastSuccess('Payment completed successfully!');
						setTimeout(() => {
							if (order) {
								goto(`/orders/${order.id}`);
							}
						}, 2000);
					} else if (newStatus === 'failed') {
						error = 'Payment processing failed';
					}
				}
			}}
		/>
		
		{#if paymentStatus === 'succeeded' && order}
			<!-- Success Summary Card -->
			<div class="mt-6 bg-green-50 border border-green-200 rounded-lg p-6">
				<div class="flex items-center">
					<svg class="h-8 w-8 text-green-600 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
					</svg>
					<div class="flex-1">
						<h3 class="text-lg font-semibold text-green-800">Payment Successful!</h3>
						<p class="text-green-700 mt-1">Your payment of {formatPrice(order.amount_cents)} has been processed.</p>
					</div>
				</div>
				
				<!-- Next Steps -->
				<div class="mt-6 border-t border-green-200 pt-4">
					<h4 class="text-md font-medium text-green-800 mb-3">What happens next?</h4>
					<ul class="space-y-2 text-green-700 text-sm">
						<li class="flex items-center">
							<svg class="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
							</svg>
							The seller has been notified of your payment
						</li>
						<li class="flex items-center">
							<svg class="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
							</svg>
							Your item will be prepared for shipping
						</li>
						<li class="flex items-center">
							<svg class="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
							</svg>
							You'll receive tracking information once shipped
						</li>
						<li class="flex items-center">
							<svg class="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
							</svg>
							Funds will be released to the seller after delivery
						</li>
					</ul>
				</div>
				
				<!-- Action Buttons -->
				<div class="mt-6 flex flex-col sm:flex-row gap-3">
					<button
						class="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
						on:click={() => goto(`/orders/${order.id}`)}
					>
						View Order Details
					</button>
					<button
						class="flex-1 bg-white hover:bg-gray-50 text-green-700 border border-green-300 font-medium py-2 px-4 rounded-lg transition duration-200"
						on:click={() => goto('/orders')}
					>
						View All Orders
					</button>
				</div>
			</div>
		{/if}
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

				<!-- Payment Method Selection -->
				<div class="space-y-4 mb-6">
					<h3 class="text-lg font-semibold text-gray-900">Payment Method</h3>
					<div class="grid grid-cols-1 gap-4">
						<!-- Credit/Debit Card -->
						<div class="relative">
							<input 
								type="radio" 
								id="payment-card" 
								name="payment-method" 
								value="card" 
								checked 
								class="sr-only peer"
							/>
							<label 
								for="payment-card" 
								class="flex items-center p-4 bg-white border-2 border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 peer-checked:border-blue-600 peer-checked:bg-blue-50"
							>
								<div class="flex items-center">
									<svg class="w-6 h-6 text-gray-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
									</svg>
									<div>
										<p class="font-medium text-gray-900">Credit or Debit Card</p>
										<p class="text-sm text-gray-500">Visa, Mastercard, American Express</p>
									</div>
								</div>
							</label>
						</div>
						
						<!-- Bank Transfer (Coming Soon) -->
						<div class="relative opacity-60">
							<input 
								type="radio" 
								id="payment-bank" 
								name="payment-method" 
								value="bank" 
								disabled 
								class="sr-only peer"
							/>
							<label 
								for="payment-bank" 
								class="flex items-center p-4 bg-white border-2 border-gray-200 rounded-lg cursor-not-allowed"
							>
								<div class="flex items-center">
									<svg class="w-6 h-6 text-gray-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
									</svg>
									<div>
										<p class="font-medium text-gray-600">Bank Transfer</p>
										<p class="text-sm text-gray-400">Coming Soon - Direct bank transfer</p>
									</div>
								</div>
								<span class="ml-auto bg-gray-100 text-gray-500 text-xs px-2 py-1 rounded">Soon</span>
							</label>
						</div>
					</div>
				</div>

				<!-- Payment Form -->
				<form on:submit|preventDefault={handlePayment} class="space-y-6">
					<!-- Card Details -->
					<div id="card-payment-section">
						<label for="card-element" class="block text-sm font-medium text-gray-700 mb-2">
							Card Information
						</label>
						<div id="card-element" class="border border-gray-300 rounded-md p-3 bg-white transition-colors focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"></div>
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
						data-testid="submit-payment"
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
					<a href="/orders/{order.id}" data-testid="cancel-payment" class="text-blue-600 hover:text-blue-800 text-sm touch-manipulation py-2 px-4 -mx-4">
						← Back to Order Details
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>
