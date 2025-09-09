<script lang="ts">
  export let title: string = 'Metric';
  export let error: Error | null = null;
  export let retry: (() => void) | null = null;
  export let retryCount: number = 0;
  export let showError: boolean = false;
  export let size: 'sm' | 'md' | 'lg' = 'md';
</script>

<div class="metric-card-fallback metric-card-fallback-{size}">
  <div class="fallback-header">
    <div class="fallback-icon">
      <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
    <h3 class="fallback-title">{title}</h3>
  </div>
  
  <div class="fallback-content">
    <div class="fallback-message">
      <p class="text-gray-500 text-sm">Unable to load metric</p>
      
      {#if showError && error}
        <p class="text-red-500 text-xs mt-1">{error.message}</p>
      {/if}
    </div>
    
    {#if retry}
      <button
        class="fallback-retry-btn"
        on:click={retry}
        title="Retry loading metric"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    {/if}
  </div>
</div>

<style>
  .metric-card-fallback {
    @apply bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 p-4 min-h-[120px] flex flex-col justify-between;
  }

  .metric-card-fallback-sm {
    @apply p-3 min-h-[100px];
  }

  .metric-card-fallback-lg {
    @apply p-6 min-h-[150px];
  }

  .fallback-header {
    @apply flex items-center gap-2 mb-3;
  }

  .fallback-icon {
    @apply w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center;
  }

  .fallback-title {
    @apply text-sm font-medium text-gray-600;
  }

  .fallback-content {
    @apply flex items-center justify-between;
  }

  .fallback-message {
    @apply flex-1;
  }

  .fallback-retry-btn {
    @apply p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
  }
</style>