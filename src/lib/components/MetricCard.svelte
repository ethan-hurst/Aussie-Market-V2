<script lang="ts">
  export let title: string;
  export let value: string | number;
  export let change: number | null = null;
  export let changeLabel: string = '';
  export let icon: string = '';
  export let color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray' = 'blue';
  export let loading: boolean = false;
  export let size: 'sm' | 'md' | 'lg' = 'md';

  $: changeColor = change === null ? 'gray' : change >= 0 ? 'green' : 'red';
  $: changeIcon = change === null ? '' : change >= 0 ? '↗' : '↘';
  $: formattedValue = safeFormatValue(value);
  $: formattedChange = safeFormatChange(change);

  function safeFormatValue(val: string | number): string {
    try {
      if (typeof val === 'string') return val;
      if (typeof val !== 'number' || isNaN(val)) return '—';
      return formatNumber(val);
    } catch (error) {
      console.warn('Error formatting metric value:', error);
      return '—';
    }
  }

  function safeFormatChange(changeVal: number | null): string {
    try {
      if (changeVal === null || typeof changeVal !== 'number' || isNaN(changeVal)) return '';
      return `${changeVal >= 0 ? '+' : ''}${changeVal.toFixed(1)}%`;
    } catch (error) {
      console.warn('Error formatting metric change:', error);
      return '';
    }
  }

  function formatNumber(num: number): string {
    try {
      if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
      if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
      if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
      return num.toFixed(0);
    } catch (error) {
      console.warn('Error in formatNumber:', error);
      return String(num);
    }
  }
</script>

<div class="metric-card metric-card-{size} metric-card-{color}">
  <div class="metric-header">
    {#if icon}
      <div class="metric-icon">
        {icon}
      </div>
    {/if}
    <h3 class="metric-title">{title}</h3>
  </div>
  
  <div class="metric-content">
    {#if loading}
      <div class="metric-loading">
        <div class="loading-spinner"></div>
      </div>
    {:else}
      <div class="metric-value">{formattedValue}</div>
      
      {#if change !== null}
        <div class="metric-change metric-change-{changeColor}">
          <span class="change-icon">{changeIcon}</span>
          <span class="change-value">{formattedChange}</span>
          {#if changeLabel}
            <span class="change-label">{changeLabel}</span>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .metric-card {
    @apply bg-white rounded-lg border border-gray-200 p-4 shadow-sm transition-all duration-200 hover:shadow-md;
  }

  .metric-card-sm {
    @apply p-3;
  }

  .metric-card-lg {
    @apply p-6;
  }

  .metric-card-blue {
    @apply border-blue-200;
  }

  .metric-card-green {
    @apply border-green-200;
  }

  .metric-card-yellow {
    @apply border-yellow-200;
  }

  .metric-card-red {
    @apply border-red-200;
  }

  .metric-card-purple {
    @apply border-purple-200;
  }

  .metric-card-gray {
    @apply border-gray-200;
  }

  .metric-header {
    @apply flex items-center gap-3 mb-3;
  }

  .metric-icon {
    @apply w-8 h-8 rounded-lg flex items-center justify-center text-lg;
  }

  .metric-card-blue .metric-icon {
    @apply bg-blue-100 text-blue-600;
  }

  .metric-card-green .metric-icon {
    @apply bg-green-100 text-green-600;
  }

  .metric-card-yellow .metric-icon {
    @apply bg-yellow-100 text-yellow-600;
  }

  .metric-card-red .metric-icon {
    @apply bg-red-100 text-red-600;
  }

  .metric-card-purple .metric-icon {
    @apply bg-purple-100 text-purple-600;
  }

  .metric-card-gray .metric-icon {
    @apply bg-gray-100 text-gray-600;
  }

  .metric-title {
    @apply text-sm font-medium text-gray-600;
  }

  .metric-content {
    @apply space-y-2;
  }

  .metric-value {
    @apply text-2xl font-bold text-gray-900;
  }

  .metric-card-sm .metric-value {
    @apply text-xl;
  }

  .metric-card-lg .metric-value {
    @apply text-3xl;
  }

  .metric-change {
    @apply flex items-center gap-1 text-sm;
  }

  .metric-change-green {
    @apply text-green-600;
  }

  .metric-change-red {
    @apply text-red-600;
  }

  .metric-change-gray {
    @apply text-gray-500;
  }

  .change-icon {
    @apply text-xs;
  }

  .change-value {
    @apply font-medium;
  }

  .change-label {
    @apply text-gray-500 ml-1;
  }

  .metric-loading {
    @apply flex items-center justify-center py-4;
  }

  .loading-spinner {
    @apply w-6 h-6 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin;
  }
</style>
