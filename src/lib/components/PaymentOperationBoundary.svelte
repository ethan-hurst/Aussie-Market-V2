<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { categorizePaymentError, type PaymentErrorInfo } from '$lib/errors';
  import PaymentErrorBoundary from './PaymentErrorBoundary.svelte';

  export let orderId: string | null = null;
  export let operationType: 'create-intent' | 'confirm-payment' | 'process-webhook' | 'general' = 'general';
  export let maxRetries: number = 3;
  export let retryCount: number = 0;
  
  const dispatch = createEventDispatcher<{
    error: { error: Error; errorInfo: PaymentErrorInfo };
    retry: { attempt: number };
    recovered: void;
  }>();

  let hasError = false;
  let currentError: Error | null = null;
  let errorInfo: PaymentErrorInfo | null = null;
  let isRecovering = false;

  // Enhanced error boundary for payment operations
  onMount(() => {
    const handleOperationError = (event: CustomEvent) => {
      const { error, operation } = event.detail;
      
      // Only handle errors for our operation type or general errors
      if (operation === operationType || operationType === 'general') {
        catchError(error);
      }
    };

    // Listen for payment operation errors
    window.addEventListener('payment-operation-error', handleOperationError as EventListener);
    
    // Enhanced error catching for payment-specific operations
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        
        // Check if this is a payment-related request that failed
        const url = args[0]?.toString() || '';
        const isPaymentRequest = url.includes('/api/payments/') || 
                                url.includes('/api/orders/') ||
                                url.includes('stripe') ||
                                url.includes('payment');
        
        if (!response.ok && isPaymentRequest) {
          const errorText = await response.text().catch(() => 'Payment request failed');
          throw new Error(`Payment API Error (${response.status}): ${errorText}`);
        }
        
        return response;
      } catch (error) {
        const url = args[0]?.toString() || '';
        const isPaymentRequest = url.includes('/api/payments/') || 
                                url.includes('/api/orders/') ||
                                url.includes('stripe') ||
                                url.includes('payment');
        
        if (isPaymentRequest) {
          catchError(error as Error);
        }
        throw error;
      }
    };

    return () => {
      window.removeEventListener('payment-operation-error', handleOperationError as EventListener);
      window.fetch = originalFetch;
    };
  });

  function catchError(error: Error) {
    console.error(`PaymentOperationBoundary caught error for ${operationType}:`, error);
    
    hasError = true;
    currentError = error;
    errorInfo = categorizePaymentError(error);
    
    dispatch('error', { error, errorInfo });
  }

  function handleRetry() {
    if (retryCount >= maxRetries) return;
    
    isRecovering = true;
    dispatch('retry', { attempt: retryCount + 1 });
    
    // Reset error state
    setTimeout(() => {
      hasError = false;
      currentError = null;
      errorInfo = null;
      isRecovering = false;
      dispatch('recovered');
    }, 1000);
  }

  function handleContactSupport() {
    // Emit error details for parent to handle support contact
    dispatch('error', { error: currentError!, errorInfo: errorInfo! });
  }

  function handleNewPayment() {
    // Reset error state and allow new payment attempt
    hasError = false;
    currentError = null;
    errorInfo = null;
    dispatch('recovered');
  }

  // Expose method to manually trigger error boundary
  export function triggerError(error: Error) {
    catchError(error);
  }

  // Expose method to clear error state
  export function clearError() {
    hasError = false;
    currentError = null;
    errorInfo = null;
  }
</script>

{#if hasError && currentError}
  <PaymentErrorBoundary
    error={currentError}
    {orderId}
    showRetry={errorInfo?.canRetry ?? true}
    {maxRetries}
    {retryCount}
    paymentStatus="failed"
    on:retry={handleRetry}
    on:contactSupport={handleContactSupport}
    on:newPayment={handleNewPayment}
  />
{:else}
  <slot {isRecovering} />
{/if}