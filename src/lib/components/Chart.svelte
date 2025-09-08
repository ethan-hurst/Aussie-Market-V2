<script lang="ts">
  export let data: any[] = [];
  export let type: 'line' | 'bar' | 'area' | 'pie' = 'line';
  export let width: number = 400;
  export let height: number = 200;
  export let title: string = '';
  export let xAxis: string = 'period_start';
  export let yAxis: string = 'metric_value';
  export let color: string = '#3b82f6';
  export let showGrid: boolean = true;
  export let showLegend: boolean = false;
  export let responsive: boolean = true;

  let chartContainer: HTMLDivElement;
  let chartWidth = width;
  let chartHeight = height;

  $: if (responsive && chartContainer) {
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        chartWidth = entry.contentRect.width;
        chartHeight = Math.max(200, entry.contentRect.height);
      }
    });
    resizeObserver.observe(chartContainer);
  }

  // Simple chart rendering logic
  $: chartData = data.map(d => ({
    x: new Date(d[xAxis]).getTime(),
    y: d[yAxis],
    label: d.metric_name || d.label || ''
  }));

  $: maxValue = Math.max(...chartData.map(d => d.y), 0);
  $: minValue = Math.min(...chartData.map(d => d.y), 0);
  $: valueRange = maxValue - minValue || 1;

  function formatValue(value: number): string {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString();
  }
</script>

<div class="chart-container" bind:this={chartContainer}>
  {#if title}
    <h3 class="chart-title">{title}</h3>
  {/if}
  
  <div class="chart-wrapper" style="width: {chartWidth}px; height: {chartHeight}px;">
    <svg width={chartWidth} height={chartHeight} class="chart-svg">
      <!-- Grid lines -->
      {#if showGrid}
        {#each Array(5) as _, i}
          <line
            x1="40"
            y1={40 + (i * (chartHeight - 80) / 4)}
            x2={chartWidth - 20}
            y2={40 + (i * (chartHeight - 80) / 4)}
            stroke="#e5e7eb"
            stroke-width="1"
          />
        {/each}
      {/if}

      <!-- Y-axis labels -->
      {#if showGrid}
        {#each Array(5) as _, i}
          <text
            x="35"
            y={45 + (i * (chartHeight - 80) / 4)}
            text-anchor="end"
            class="axis-label"
          >
            {formatValue(maxValue - (i * valueRange / 4))}
          </text>
        {/each}
      {/if}

      <!-- Chart content based on type -->
      {#if type === 'line' && chartData.length > 0}
        <!-- Line chart -->
        <path
          d="M {chartData.map((d, i) => 
            `${40 + (i * (chartWidth - 60) / (chartData.length - 1))},${chartHeight - 40 - ((d.y - minValue) / valueRange) * (chartHeight - 80)}`
          ).join(' L ')}"
          fill="none"
          stroke={color}
          stroke-width="2"
          class="chart-line"
        />
        
        <!-- Data points -->
        {#each chartData as point, i}
          <circle
            cx={40 + (i * (chartWidth - 60) / (chartData.length - 1))}
            cy={chartHeight - 40 - ((point.y - minValue) / valueRange) * (chartHeight - 80)}
            r="4"
            fill={color}
            class="data-point"
          />
        {/each}
      {:else if type === 'bar' && chartData.length > 0}
        <!-- Bar chart -->
        {#each chartData as point, i}
          <rect
            x={40 + (i * (chartWidth - 60) / chartData.length) + 5}
            y={chartHeight - 40 - ((point.y - minValue) / valueRange) * (chartHeight - 80)}
            width={(chartWidth - 60) / chartData.length - 10}
            height={((point.y - minValue) / valueRange) * (chartHeight - 80)}
            fill={color}
            class="chart-bar"
          />
        {/each}
      {:else if type === 'area' && chartData.length > 0}
        <!-- Area chart -->
        <path
          d="M 40,{chartHeight - 40} L {chartData.map((d, i) => 
            `${40 + (i * (chartWidth - 60) / (chartData.length - 1))},${chartHeight - 40 - ((d.y - minValue) / valueRange) * (chartHeight - 80)}`
          ).join(' L ')} L {chartWidth - 20},{chartHeight - 40} Z"
          fill={color}
          fill-opacity="0.3"
          stroke={color}
          stroke-width="2"
          class="chart-area"
        />
      {:else if type === 'pie' && chartData.length > 0}
        <!-- Simple pie chart representation -->
        {#each chartData as point, i}
          <circle
            cx={chartWidth / 2}
            cy={chartHeight / 2}
            r={Math.min(chartWidth, chartHeight) / 4}
            fill="transparent"
            stroke={color}
            stroke-width="20"
            stroke-dasharray={`${(point.y / maxValue) * Math.PI * 2 * (Math.min(chartWidth, chartHeight) / 4)} ${Math.PI * 2 * (Math.min(chartWidth, chartHeight) / 4)}`}
            stroke-dashoffset={-i * (Math.PI * 2 * (Math.min(chartWidth, chartHeight) / 4)) / chartData.length}
            class="pie-segment"
          />
        {/each}
      {/if}

      <!-- X-axis -->
      <line
        x1="40"
        y1={chartHeight - 40}
        x2={chartWidth - 20}
        y2={chartHeight - 40}
        stroke="#374151"
        stroke-width="2"
      />

      <!-- Y-axis -->
      <line
        x1="40"
        y1="20"
        x2="40"
        y2={chartHeight - 40}
        stroke="#374151"
        stroke-width="2"
      />
    </svg>
  </div>

  {#if showLegend && chartData.length > 0}
    <div class="chart-legend">
      {#each chartData as point, i}
        <div class="legend-item">
          <div class="legend-color" style="background-color: {color}"></div>
          <span class="legend-label">{point.label}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .chart-container {
    @apply bg-white rounded-lg border border-gray-200 p-4;
  }

  .chart-title {
    @apply text-lg font-semibold text-gray-900 mb-4;
  }

  .chart-wrapper {
    @apply relative;
  }

  .chart-svg {
    @apply w-full h-full;
  }

  .axis-label {
    @apply text-xs fill-gray-600;
  }

  .chart-line {
    @apply transition-all duration-300;
  }

  .data-point {
    @apply transition-all duration-300 cursor-pointer;
  }

  .data-point:hover {
    r: 6;
  }

  .chart-bar {
    @apply transition-all duration-300 cursor-pointer;
  }

  .chart-bar:hover {
    @apply opacity-80;
  }

  .chart-area {
    @apply transition-all duration-300;
  }

  .pie-segment {
    @apply transition-all duration-300 cursor-pointer;
  }

  .pie-segment:hover {
    @apply opacity-80;
  }

  .chart-legend {
    @apply flex flex-wrap gap-4 mt-4;
  }

  .legend-item {
    @apply flex items-center gap-2;
  }

  .legend-color {
    @apply w-3 h-3 rounded;
  }

  .legend-label {
    @apply text-sm text-gray-700;
  }
</style>
