<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { AlertTriangle, RefreshCw, CreditCard, Wifi, WifiOff } from 'lucide-svelte';
  import { categorizePaymentError, type PaymentErrorInfo } from '$lib/errors';
  import { mapApiErrorToMessage } from '$lib/errors';
  import type { PaymentNotificationAction } from '$lib/types/payment';

  export let error: Error | null = null;
  export let orderId: string | null = null;
  export let showRetry: boolean = true;
  export let maxRetries: number = 3;
  export let retryCount: number = 0;

  const dispatch = createEventDispatcher<{
    retry: { attempt: number };
    contactSupport: { error: Error | null; orderId: string | null };
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

  function getErrorClasses() {
    const color = getErrorColor();
    const classMap = {
      red: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-600',
        textDark: 'text-red-800',
        textLight: 'text-red-700'
      },
      orange: {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-600',
        textDark: 'text-orange-800',
        textLight: 'text-orange-700'
      },
      blue: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-600',
        textDark: 'text-blue-800',
        textLight: 'text-blue-700'
      },
      yellow: {
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        text: 'text-yellow-600',
        textDark: 'text-yellow-800',
        textLight: 'text-yellow-700'
      }
    };
    return classMap[color] || classMap.red;
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
  {@const errorClasses = getErrorClasses()}
  <div class="payment-error-boundary" role="alert" aria-live="polite">
    <div class="error-container {errorClasses.bg} border {errorClasses.border} rounded-lg p-6">
      <div class="flex items-start">
        <div class="flex-shrink-0">
          <svelte:component this={getErrorIcon()} class="h-6 w-6 {errorClasses.text}" />
        </div>
        <div class="ml-3 flex-1">
          <h3 class="text-lg font-medium {errorClasses.textDark}">
            {getErrorTitle()}
          </h3>
          <p class="mt-2 text-sm {errorClasses.textLight}">
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
                  aria-describedby="retry-description"
                  tabindex="0"
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
                  tabindex="0"
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
                  tabindex="0"
                >
                  Contact Support
                </button>
              {/if}

              <!-- Max retries reached message -->
              {#if retryCount >= maxRetries}
                <div 
                  class="text-sm {errorClasses.text}"
                  role="alert"
                  aria-live="assertive"
                >
                  <p id="retry-description">
                    Maximum retry attempts reached. Please contact support for assistance.
                  </p>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Order ID display -->
          {#if orderId}
            <div class="mt-4 text-xs {errorClasses.text}">
              Order ID: {orderId}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Additional help text -->
    <div class="mt-4 text-sm text-gray-600" role="region" aria-label="Additional help information">
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
