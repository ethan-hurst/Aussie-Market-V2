<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  export let fallbackComponent: any = null;
  export let fallbackMessage: string = 'Something went wrong';
  export let showDetails: boolean = false;
  export let retryable: boolean = true;

  const dispatch = createEventDispatcher();
  
  let hasError = false;
  let error: Error | null = null;
  let errorDetails: string = '';
  let retryCount = 0;
  const maxRetries = 3;
  
  function handleError(event: ErrorEvent | PromiseRejectionEvent) {
    hasError = true;
    
    if (event instanceof ErrorEvent) {
      error = new Error(event.message);
      errorDetails = `${event.message}\nFile: ${event.filename}\nLine: ${event.lineno}:${event.colno}`;
    } else {
      error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      errorDetails = error.stack || error.message;
    }
    
    console.error('ErrorBoundary caught error:', error, errorDetails);
    dispatch('error', { error, errorDetails, retryCount });
  }
  
  function retry() {
    if (retryCount < maxRetries) {
      retryCount++;
      hasError = false;
      error = null;
      errorDetails = '';
      dispatch('retry', { retryCount });
    }
  }
  
  function reset() {
    hasError = false;
    error = null;
    errorDetails = '';
    retryCount = 0;
    dispatch('reset');
  }

  onMount(() => {
    const errorHandler = (event: ErrorEvent) => handleError(event);
    const unhandledRejectionHandler = (event: PromiseRejectionEvent) => handleError(event);
    
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', unhandledRejectionHandler);
    
    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
    };
  });
</script>

{#if hasError}
  {#if fallbackComponent}
    <svelte:component this={fallbackComponent} {error} {retry} {reset} {retryCount} />
  {:else}
    <div class="error-boundary">
      <div class="error-content">
        <div class="error-icon">
          <svg class="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        
        <h3 class="error-title">Oops! Something went wrong</h3>
        <p class="error-message">{fallbackMessage}</p>
        
        {#if showDetails && errorDetails}
          <details class="error-details">
            <summary class="error-details-toggle">View technical details</summary>
            <pre class="error-details-content">{errorDetails}</pre>
          </details>
        {/if}
        
        <div class="error-actions">
          {#if retryable && retryCount < maxRetries}
            <button class="error-retry-btn" on:click={retry}>
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Try Again {retryCount > 0 ? `(${retryCount}/${maxRetries})` : ''}
            </button>
          {/if}
          
          <button class="error-reset-btn" on:click={reset}>
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  {/if}
{:else}
  <slot />
{/if}

<style>
  .error-boundary {
    @apply min-h-64 flex items-center justify-center p-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200;
  }

  .error-content {
    @apply text-center max-w-md mx-auto;
  }

  .error-icon {
    @apply flex justify-center mb-4;
  }

  .error-title {
    @apply text-xl font-semibold text-gray-900 mb-2;
  }

  .error-message {
    @apply text-gray-600 mb-4;
  }

  .error-details {
    @apply mt-4 text-left;
  }

  .error-details-toggle {
    @apply cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-medium;
  }

  .error-details-content {
    @apply mt-2 p-3 bg-gray-100 rounded text-xs text-gray-700 overflow-auto max-h-32 font-mono;
  }

  .error-actions {
    @apply flex gap-3 justify-center mt-6;
  }

  .error-retry-btn {
    @apply inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200;
  }

  .error-reset-btn {
    @apply inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200;
  }
</style>