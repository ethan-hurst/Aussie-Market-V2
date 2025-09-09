<script lang="ts">
  import { CheckCircle, Clock, AlertCircle, XCircle, Loader2, RefreshCw } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';
  import { goto } from '$app/navigation';

  export let status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' = 'pending';
  export let showProgress: boolean = true;
  export let progressSteps: string[] = ['Payment Details', 'Processing', 'Confirmation'];
  export let currentStep: number = 0;
  export let error: string | null = null;
  export let retryable: boolean = false;

  const dispatch = createEventDispatcher<{
    retry: void;
    cancel: void;
  }>();

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

<div class="payment-status-indicator" role="status" aria-live="polite">
  <!-- Main status display -->
  {#if true}
    {@const statusClasses = getStatusClasses()}
    <div class="status-header flex items-center space-x-3 p-4 {statusClasses.bg} border {statusClasses.border} rounded-lg">
    <div class="flex-shrink-0">
      <svelte:component 
        this={getStatusIcon()} 
        class="h-8 w-8 {statusClasses.icon} {status === 'processing' ? 'animate-spin' : ''}" 
      />
    </div>
    <div class="flex-1">
      <h3 class="text-lg font-medium {statusClasses.title}">
        {getStatusText()}
      </h3>
      <p class="text-sm {statusClasses.description} mt-1">
        {getStatusDescription()}
      </p>
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
            <span class="text-xs text-gray-600 mt-2 text-center max-w-20">
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
      >
        Cancel
      </button>
    {/if}

    {#if status === 'succeeded'}
      <button
        class="btn btn-primary"
        on:click={() => goto('/orders')}
        aria-label="View orders"
      >
        View Orders
      </button>
    {/if}
  </div>

  <!-- Additional status information -->
  {#if status === 'processing'}
    <div class="processing-info mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
      <p class="text-sm text-blue-700">
        <strong>Please don't close this window</strong> while your payment is being processed.
        This usually takes a few seconds.
      </p>
    </div>
  {/if}

  {#if status === 'failed' && error}
    <div class="error-details mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
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
