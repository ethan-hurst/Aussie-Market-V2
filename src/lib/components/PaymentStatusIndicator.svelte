<script lang="ts">
  import { CheckCircle, Clock, AlertCircle, XCircle, Loader2, RefreshCw } from 'lucide-svelte';
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';

  export let status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' = 'pending';
  export let showProgress: boolean = true;
  export let progressSteps: string[] = ['Payment Details', 'Processing', 'Confirmation'];
  export let currentStep: number = 0;
  export let error: string | null = null;
  export let retryable: boolean = false;
  export let orderId: string | null = null;
  export let autoUpdateInterval: number = 2000; // Auto-refresh interval in ms
  export let enableAutoUpdate: boolean = false; // Enable real-time status updates

  const dispatch = createEventDispatcher<{
    retry: void;
    cancel: void;
    statusUpdate: { status: string; timestamp: number };
  }>();

  let previousStatus = status;
  let statusUpdateTimestamp = Date.now();
  let updateInterval: number | null = null;
  let isTransitioning = false;

  // Real-time status synchronization
  $: if (status !== previousStatus) {
    handleStatusChange(status, previousStatus);
    previousStatus = status;
  }

  async function handleStatusChange(newStatus: string, oldStatus: string) {
    statusUpdateTimestamp = Date.now();
    isTransitioning = true;
    
    // Update current step based on status
    if (newStatus === 'processing') {
      currentStep = 1;
    } else if (newStatus === 'succeeded') {
      currentStep = 2;
    } else if (newStatus === 'failed' || newStatus === 'cancelled') {
      // Keep current step but don't advance
    }
    
    // Allow UI to update
    await tick();
    
    // Dispatch status update event
    dispatch('statusUpdate', { 
      status: newStatus, 
      timestamp: statusUpdateTimestamp 
    });
    
    // Reset transition flag after animation
    setTimeout(() => {
      isTransitioning = false;
    }, 300);
  }

  // Auto-update mechanism for real-time status checking
  onMount(() => {
    if (enableAutoUpdate && orderId && (status === 'processing' || status === 'pending')) {
      startAutoUpdate();
    }
    
    return () => {
      stopAutoUpdate();
    };
  });

  onDestroy(() => {
    stopAutoUpdate();
  });

  function startAutoUpdate() {
    if (updateInterval) return;
    
    updateInterval = window.setInterval(async () => {
      if (!orderId || status === 'succeeded' || status === 'failed' || status === 'cancelled') {
        stopAutoUpdate();
        return;
      }
      
      try {
        // Fetch current order status
        const response = await fetch(`/api/orders/${orderId}`);
        if (response.ok) {
          const order = await response.json();
          const newStatus = mapOrderStateToPaymentStatus(order.state);
          
          if (newStatus !== status) {
            status = newStatus;
          }
        }
      } catch (err) {
        console.error('Error updating payment status:', err);
        // Don't stop auto-update on network errors, just log them
      }
    }, autoUpdateInterval);
  }

  function stopAutoUpdate() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  }

  function mapOrderStateToPaymentStatus(orderState: string): 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' {
    switch (orderState) {
      case 'paid':
        return 'succeeded';
      case 'pending_payment':
        return 'processing';
      case 'cancelled':
        return 'cancelled';
      case 'refunded':
        return 'failed';
      default:
        return 'pending';
    }
  }

  function getStatusIcon() {
    switch (status) {
      case 'succeeded':
        return CheckCircle;
      case 'failed':
        return XCircle;
      case 'cancelled':
        return AlertCircle;
      case 'processing':
        return Loader2;
      default:
        return Clock;
    }
  }

  function getStatusColor() {
    switch (status) {
      case 'succeeded':
        return 'green';
      case 'failed':
        return 'red';
      case 'cancelled':
        return 'yellow';
      case 'processing':
        return 'blue';
      default:
        return 'gray';
    }
  }

  function getStatusClasses() {
    const color = getStatusColor();
    const classMap = {
      green: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        icon: 'text-green-600',
        title: 'text-green-800',
        description: 'text-green-700'
      },
      red: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        icon: 'text-red-600',
        title: 'text-red-800',
        description: 'text-red-700'
      },
      yellow: {
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        icon: 'text-yellow-600',
        title: 'text-yellow-800',
        description: 'text-yellow-700'
      },
      blue: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        icon: 'text-blue-600',
        title: 'text-blue-800',
        description: 'text-blue-700'
      },
      gray: {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        icon: 'text-gray-600',
        title: 'text-gray-800',
        description: 'text-gray-700'
      }
    };
    return classMap[color] || classMap.gray;
  }

  function getStatusText() {
    switch (status) {
      case 'succeeded':
        return 'Payment Successful';
      case 'failed':
        return 'Payment Failed';
      case 'cancelled':
        return 'Payment Cancelled';
      case 'processing':
        return 'Processing Payment';
      default:
        return 'Payment Pending';
    }
  }

  function getStatusDescription() {
    switch (status) {
      case 'succeeded':
        return 'Your payment has been processed successfully.';
      case 'failed':
        return error || 'Your payment could not be processed.';
      case 'cancelled':
        return 'Payment was cancelled. You can try again.';
      case 'processing':
        return 'Please wait while we process your payment.';
      default:
        return 'Please complete your payment details.';
    }
  }

  function handleRetry() {
    dispatch('retry');
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

<div class="payment-status-indicator" role="status" aria-live="polite" aria-atomic="true">
  <!-- Main status display -->
  {#if status}
    {@const statusClasses = getStatusClasses()}
    <div class="status-header flex items-center space-x-3 p-4 {statusClasses.bg} border {statusClasses.border} rounded-lg transition-all duration-300 {isTransitioning ? 'transform scale-105' : ''}">
    <div class="flex-shrink-0">
      <svelte:component 
        this={getStatusIcon()} 
        class="h-8 w-8 {statusClasses.icon} {status === 'processing' ? 'animate-spin' : ''} transition-colors duration-300" 
      />
    </div>
    <div class="flex-1">
      <h3 class="text-lg font-medium {statusClasses.title} transition-colors duration-300">
        {getStatusText()}
      </h3>
      <p class="text-sm {statusClasses.description} mt-1 transition-colors duration-300">
        {getStatusDescription()}
      </p>
      
      <!-- Status timestamp for debugging/info -->
      {#if statusUpdateTimestamp}
        <p class="text-xs text-gray-500 mt-1">
          Last updated: {new Date(statusUpdateTimestamp).toLocaleTimeString()}
        </p>
      {/if}
    </div>
  </div>
  {/if}

  <!-- Progress steps -->
  {#if showProgress && progressSteps.length > 0}
    <div class="progress-steps mt-6">
      <div class="flex items-center justify-between">
        {#each progressSteps as step, index}
          <div class="flex flex-col items-center flex-1">
            <div class="flex items-center">
              <!-- Step circle -->
              <div class="flex items-center justify-center w-8 h-8 rounded-full border-2 {
                index < currentStep ? 'bg-green-600 border-green-600 text-white' :
                index === currentStep ? 'bg-blue-600 border-blue-600 text-white' :
                'bg-gray-200 border-gray-300 text-gray-500'
              }">
                {#if index < currentStep}
                  <CheckCircle class="h-5 w-5" />
                {:else if index === currentStep && status === 'processing'}
                  <Loader2 class="h-5 w-5 animate-spin" />
                {:else}
                  <span class="text-sm font-medium">{index + 1}</span>
                {/if}
              </div>
              
              <!-- Connector line -->
              {#if index < progressSteps.length - 1}
                <div class="flex-1 h-0.5 mx-2 {
                  index < currentStep ? 'bg-green-600' :
                  index === currentStep ? 'bg-blue-600' :
                  'bg-gray-300'
                }"></div>
              {/if}
            </div>
            
            <!-- Step label -->
            <span 
              class="text-xs text-gray-600 mt-2 text-center max-w-20"
              aria-label="Step {index + 1}: {step} {index < currentStep ? '(completed)' : index === currentStep ? '(current)' : '(pending)'}"
            >
              {step}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Action buttons -->
  <div class="action-buttons mt-6 flex space-x-3">
    {#if status === 'failed' && retryable}
      <button
        class="btn btn-primary"
        on:click={handleRetry}
        aria-label="Retry payment"
        aria-describedby="retry-help"
        tabindex="0"
      >
        <RefreshCw class="h-4 w-4 mr-2" />
        Try Again
      </button>
    {/if}

    {#if status === 'cancelled' || status === 'failed'}
      <button
        class="btn btn-outline"
        on:click={handleCancel}
        aria-label="Cancel payment"
        tabindex="0"
      >
        Cancel
      </button>
    {/if}

    {#if status === 'succeeded'}
      <button
        class="btn btn-primary"
        on:click={() => goto('/orders')}
        aria-label="View orders"
        tabindex="0"
      >
        View Orders
      </button>
    {/if}
  </div>

  <!-- Additional status information -->
  {#if status === 'processing'}
    <div 
      class="processing-info mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md" 
      role="alert"
      aria-live="polite"
      id="processing-info"
    >
      <p class="text-sm text-blue-700">
        <strong>Please don't close this window</strong> while your payment is being processed.
        This usually takes a few seconds.
      </p>
    </div>
  {/if}

  {#if status === 'failed' && error}
    <div 
      class="error-details mt-4 p-3 bg-red-50 border border-red-200 rounded-md" 
      role="alert"
      aria-live="assertive"
      id="retry-help"
    >
      <p class="text-sm text-red-700">
        <strong>Error:</strong> {error}
      </p>
    </div>
  {/if}
</div>

<style>
  .payment-status-indicator {
    @apply w-full max-w-md mx-auto;
  }
  
  .btn {
    @apply inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors;
  }
  
  .btn-primary {
    @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
  }
  
  .btn-outline {
    @apply bg-white text-gray-700 border-gray-300 hover:bg-gray-50 focus:ring-blue-500;
  }
  
  .progress-steps {
    @apply relative;
  }
</style>
