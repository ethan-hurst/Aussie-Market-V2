<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { AlertTriangle, RefreshCw, CreditCard, Wifi, WifiOff } from 'lucide-svelte';
  import { categorizePaymentError, type PaymentErrorInfo } from '$lib/errors';
  import { mapApiErrorToMessage } from '$lib/errors';

  export let error: any = null;
  export let orderId: string | null = null;
  export let showRetry: boolean = true;
  export let maxRetries: number = 3;
  export let retryCount: number = 0;

  const dispatch = createEventDispatcher<{
    retry: { attempt: number };
    contactSupport: { error: any; orderId: string | null };
    newPayment: { orderId: string | null };
  }>();

  let errorInfo: PaymentErrorInfo | null = null;
  let isRetrying = false;

  $: if (error) {
    errorInfo = categorizePaymentError(error);
  }

  function handleRetry() {
    if (retryCount >= maxRetries) return;
    
    isRetrying = true;
    dispatch('retry', { attempt: retryCount + 1 });
    
    // Reset retrying state after a delay
    setTimeout(() => {
      isRetrying = false;
    }, 2000);
  }

  function handleContactSupport() {
    dispatch('contactSupport', { error, orderId });
  }

  function handleNewPayment() {
    dispatch('newPayment', { orderId });
  }

  function getErrorIcon() {
    if (!errorInfo) return AlertTriangle;
    
    switch (errorInfo.type) {
      case 'card_error':
        return CreditCard;
      case 'network_error':
        return WifiOff;
      case 'webhook_error':
      case 'processing_error':
        return RefreshCw;
      default:
        return AlertTriangle;
    }
  }

  function getErrorColor() {
    if (!errorInfo) return 'red';
    
    switch (errorInfo.type) {
      case 'card_error':
        return 'orange';
      case 'network_error':
        return 'blue';
      case 'webhook_error':
      case 'processing_error':
        return 'yellow';
      default:
        return 'red';
    }
  }

  function getErrorTitle() {
    if (!errorInfo) return 'Payment Error';
    
    switch (errorInfo.type) {
      case 'card_error':
        return 'Payment Method Issue';
      case 'network_error':
        return 'Connection Problem';
      case 'webhook_error':
        return 'Payment Processing Delay';
      case 'processing_error':
        return 'Payment Processing Issue';
      default:
        return 'Payment Error';
    }
  }
</script>

{#if error}
  <div class="payment-error-boundary" role="alert" aria-live="polite">
    <div class="error-container bg-{getErrorColor()}-50 border border-{getErrorColor()}-200 rounded-lg p-6">
      <div class="flex items-start">
        <div class="flex-shrink-0">
          <svelte:component this={getErrorIcon()} class="h-6 w-6 text-{getErrorColor()}-600" />
        </div>
        <div class="ml-3 flex-1">
          <h3 class="text-lg font-medium text-{getErrorColor()}-800">
            {getErrorTitle()}
          </h3>
          <p class="mt-2 text-sm text-{getErrorColor()}-700">
            {errorInfo?.userMessage || mapApiErrorToMessage(error)}
          </p>
          
          {#if errorInfo}
            <div class="mt-4 space-y-3">
              <!-- Retry button for retryable errors -->
              {#if errorInfo.canRetry && showRetry && retryCount < maxRetries}
                <button
                  class="btn btn-primary btn-sm"
                  on:click={handleRetry}
                  disabled={isRetrying}
                  aria-label="Retry payment"
                >
                  {#if isRetrying}
                    <RefreshCw class="h-4 w-4 animate-spin mr-2" />
                    Retrying...
                  {:else}
                    <RefreshCw class="h-4 w-4 mr-2" />
                    Try Again ({retryCount + 1}/{maxRetries})
                  {/if}
                </button>
              {/if}

              <!-- New payment button for card errors -->
              {#if errorInfo.requiresNewPayment}
                <button
                  class="btn btn-outline btn-sm"
                  on:click={handleNewPayment}
                  aria-label="Try different payment method"
                >
                  <CreditCard class="h-4 w-4 mr-2" />
                  Try Different Payment Method
                </button>
              {/if}

              <!-- Contact support button -->
              {#if errorInfo.shouldContactSupport}
                <button
                  class="btn btn-outline btn-sm"
                  on:click={handleContactSupport}
                  aria-label="Contact support"
                >
                  Contact Support
                </button>
              {/if}

              <!-- Max retries reached message -->
              {#if retryCount >= maxRetries}
                <p class="text-sm text-{getErrorColor()}-600">
                  Maximum retry attempts reached. Please contact support for assistance.
                </p>
              {/if}
            </div>
          {/if}

          <!-- Order ID display -->
          {#if orderId}
            <div class="mt-4 text-xs text-{getErrorColor()}-600">
              Order ID: {orderId}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Additional help text -->
    <div class="mt-4 text-sm text-gray-600">
      <p>
        If you continue to experience issues, please check your internet connection and try again.
        For immediate assistance, contact our support team.
      </p>
    </div>
  </div>
{/if}

<style>
  .payment-error-boundary {
    @apply w-full;
  }
  
  .error-container {
    @apply transition-all duration-200;
  }
  
  .btn {
    @apply inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors;
  }
  
  .btn-primary {
    @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
  }
  
  .btn-outline {
    @apply bg-white text-gray-700 border-gray-300 hover:bg-gray-50 focus:ring-blue-500;
  }
  
  .btn-sm {
    @apply px-2 py-1 text-xs;
  }
  
  .btn:disabled {
    @apply opacity-50 cursor-not-allowed;
  }
</style>
