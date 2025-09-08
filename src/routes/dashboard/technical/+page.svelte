<script lang="ts">
  import { onMount } from 'svelte';
  
  export let data;
  
  let performanceData = data.performanceData;
  let operationalData = data.operationalData;
  let performanceEvents = data.performanceEvents;
  let operationalEvents = data.operationalEvents;
  let timeRange = data.timeRange;
  let lastUpdated = data.lastUpdated;
  let isLoading = false;
  let error: string | null = data.error || null;
  
  // Auto-refresh data every 10 seconds for technical metrics
  let refreshInterval: NodeJS.Timeout;
  
  onMount(() => {
    refreshInterval = setInterval(refreshData, 10000);
    return () => clearInterval(refreshInterval);
  });
  
  async function refreshData() {
    isLoading = true;
    try {
      const [performanceResponse, operationalResponse, performanceEventsResponse, operationalEventsResponse] = await Promise.all([
        fetch(`/api/kpi/dashboard?timeRange=${timeRange}&category=performance`),
        fetch(`/api/kpi/dashboard?timeRange=${timeRange}&category=operational`),
        fetch('/api/kpi/events?category=performance&limit=50'),
        fetch('/api/kpi/events?category=operational&limit=50')
      ]);
      
      const [performanceResult, operationalResult, performanceEventsResult, operationalEventsResult] = await Promise.all([
        performanceResponse.json(),
        operationalResponse.json(),
        performanceEventsResponse.json(),
        operationalEventsResponse.json()
      ]);
      
      if (performanceResult.success) {
        performanceData = performanceResult.data;
      }
      if (operationalResult.success) {
        operationalData = operationalResult.data;
      }
      if (performanceEventsResult.success) {
        performanceEvents = performanceEventsResult.data;
      }
      if (operationalEventsResult.success) {
        operationalEvents = operationalEventsResult.data;
      }
      
      lastUpdated = new Date().toISOString();
      error = null;
    } catch (err) {
      error = 'Network error while refreshing data';
      console.error('Error refreshing technical data:', err);
    } finally {
      isLoading = false;
    }
  }
  
  function changeTimeRange(newRange: string) {
    timeRange = newRange;
    refreshData();
  }
  
  // Calculate technical metrics
  $: avgResponseTime = performanceData.performance
    .filter((m: any) => m.metric_name === 'avg_response_time_ms')
    .slice(-1)[0]?.metric_value || 0;
    
  $: p95ResponseTime = performanceData.performance
    .filter((m: any) => m.metric_name === 'p95_response_time_ms')
    .slice(-1)[0]?.metric_value || 0;
    
  $: requestsPerSecond = performanceData.performance
    .filter((m: any) => m.metric_name === 'requests_per_second')
    .slice(-1)[0]?.metric_value || 0;
    
  $: databaseQueryTime = performanceData.performance
    .filter((m: any) => m.metric_name === 'database_query_time_ms')
    .slice(-1)[0]?.metric_value || 0;
    
  $: edgeFunctionExecutionTime = performanceData.performance
    .filter((m: any) => m.metric_name === 'edge_function_execution_time_ms')
    .slice(-1)[0]?.metric_value || 0;
    
  $: systemUptime = operationalData.operational
    .filter((m: any) => m.metric_name === 'system_uptime_percent')
    .slice(-1)[0]?.metric_value || 100;
    
  $: errorRate = operationalData.operational
    .filter((m: any) => m.metric_name === 'error_rate_percent')
    .slice(-1)[0]?.metric_value || 0;
    
  $: memoryUsage = operationalData.operational
    .filter((m: any) => m.metric_name === 'memory_usage_percent')
    .slice(-1)[0]?.metric_value || 0;
    
  $: cpuUsage = operationalData.operational
    .filter((m: any) => m.metric_name === 'cpu_usage_percent')
    .slice(-1)[0]?.metric_value || 0;
</script>

<svelte:head>
  <title>Technical Dashboard - Aussie Market</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header Controls -->
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Technical Dashboard</h1>
      <p class="text-gray-600 mt-1">API performance, database queries, and Edge Function metrics</p>
    </div>
    
    <div class="flex items-center space-x-4">
      <!-- Time Range Selector -->
      <div class="flex rounded-md shadow-sm">
        <button
          class="px-3 py-2 text-sm font-medium border border-gray-300 rounded-l-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {timeRange === '1d' ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-700'}"
          on:click={() => changeTimeRange('1d')}
        >
          24h
        </button>
        <button
          class="px-3 py-2 text-sm font-medium border-t border-b border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {timeRange === '7d' ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-700'}"
          on:click={() => changeTimeRange('7d')}
        >
          7d
        </button>
        <button
          class="px-3 py-2 text-sm font-medium border-t border-b border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {timeRange === '30d' ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-700'}"
          on:click={() => changeTimeRange('30d')}
        >
          30d
        </button>
      </div>
      
      <!-- Refresh Button -->
      <button
        class="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        on:click={refreshData}
        disabled={isLoading}
      >
        <svg class="w-4 h-4 mr-2 {isLoading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {isLoading ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  </div>

  <!-- Error Alert -->
  {#if error}
    <div class="rounded-md bg-red-50 p-4">
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-red-800">Error loading technical data</h3>
          <div class="mt-2 text-sm text-red-700">
            <p>{error}</p>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Performance Overview -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    <!-- Average Response Time -->
    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 {avgResponseTime < 200 ? 'text-green-600' : avgResponseTime < 500 ? 'text-yellow-600' : 'text-red-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Avg Response Time</dt>
              <dd class="text-lg font-medium {avgResponseTime < 200 ? 'text-green-600' : avgResponseTime < 500 ? 'text-yellow-600' : 'text-red-600'}">{avgResponseTime.toFixed(0)}ms</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <!-- P95 Response Time -->
    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 {p95ResponseTime < 500 ? 'text-green-600' : p95ResponseTime < 1000 ? 'text-yellow-600' : 'text-red-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">P95 Response Time</dt>
              <dd class="text-lg font-medium {p95ResponseTime < 500 ? 'text-green-600' : p95ResponseTime < 1000 ? 'text-yellow-600' : 'text-red-600'}">{p95ResponseTime.toFixed(0)}ms</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <!-- Requests per Second -->
    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Requests/sec</dt>
              <dd class="text-lg font-medium text-gray-900">{requestsPerSecond.toFixed(1)}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <!-- System Uptime -->
    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 {systemUptime >= 99.9 ? 'text-green-600' : systemUptime >= 99 ? 'text-yellow-600' : 'text-red-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">System Uptime</dt>
              <dd class="text-lg font-medium {systemUptime >= 99.9 ? 'text-green-600' : systemUptime >= 99 ? 'text-yellow-600' : 'text-red-600'}">{systemUptime.toFixed(2)}%</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Detailed Performance Metrics -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Database Performance -->
    <div class="bg-white shadow rounded-lg p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Database Performance</h3>
      <div class="space-y-4">
        <div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-600">Query Time</span>
            <span class="font-medium {databaseQueryTime < 100 ? 'text-green-600' : databaseQueryTime < 300 ? 'text-yellow-600' : 'text-red-600'}">{databaseQueryTime.toFixed(0)}ms</span>
          </div>
          <div class="mt-1 bg-gray-200 rounded-full h-2">
            <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: {Math.min(databaseQueryTime / 5, 100)}%"></div>
          </div>
        </div>
        
        <div class="pt-4 border-t">
          <div class="text-sm text-gray-600">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {databaseQueryTime < 100 ? 'bg-green-100 text-green-800' : databaseQueryTime < 300 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
              {databaseQueryTime < 100 ? 'Excellent' : databaseQueryTime < 300 ? 'Good' : 'Needs Optimization'}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Edge Function Performance -->
    <div class="bg-white shadow rounded-lg p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Edge Function Performance</h3>
      <div class="space-y-4">
        <div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-600">Execution Time</span>
            <span class="font-medium {edgeFunctionExecutionTime < 200 ? 'text-green-600' : edgeFunctionExecutionTime < 500 ? 'text-yellow-600' : 'text-red-600'}">{edgeFunctionExecutionTime.toFixed(0)}ms</span>
          </div>
          <div class="mt-1 bg-gray-200 rounded-full h-2">
            <div class="bg-purple-600 h-2 rounded-full transition-all duration-300" style="width: {Math.min(edgeFunctionExecutionTime / 5, 100)}%"></div>
          </div>
        </div>
        
        <div class="pt-4 border-t">
          <div class="text-sm text-gray-600">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {edgeFunctionExecutionTime < 200 ? 'bg-green-100 text-green-800' : edgeFunctionExecutionTime < 500 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
              {edgeFunctionExecutionTime < 200 ? 'Fast' : edgeFunctionExecutionTime < 500 ? 'Moderate' : 'Slow'}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- System Resources -->
  <div class="bg-white shadow rounded-lg p-6">
    <h3 class="text-lg font-medium text-gray-900 mb-4">System Resources</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- CPU Usage -->
      <div>
        <div class="flex justify-between text-sm mb-2">
          <span class="text-gray-600">CPU Usage</span>
          <span class="font-medium {cpuUsage < 70 ? 'text-green-600' : cpuUsage < 90 ? 'text-yellow-600' : 'text-red-600'}">{cpuUsage.toFixed(1)}%</span>
        </div>
        <div class="bg-gray-200 rounded-full h-3">
          <div class="bg-blue-600 h-3 rounded-full transition-all duration-300" style="width: {cpuUsage}%"></div>
        </div>
      </div>
      
      <!-- Memory Usage -->
      <div>
        <div class="flex justify-between text-sm mb-2">
          <span class="text-gray-600">Memory Usage</span>
          <span class="font-medium {memoryUsage < 70 ? 'text-green-600' : memoryUsage < 90 ? 'text-yellow-600' : 'text-red-600'}">{memoryUsage.toFixed(1)}%</span>
        </div>
        <div class="bg-gray-200 rounded-full h-3">
          <div class="bg-purple-600 h-3 rounded-full transition-all duration-300" style="width: {memoryUsage}%"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Recent Events -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Performance Events -->
    <div class="bg-white shadow rounded-lg">
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900">Recent Performance Events</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each performanceEvents.slice(0, 10) as event}
              <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {event.event_type}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {event.metric_value} {event.metric_unit || ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(event.recorded_at).toLocaleString()}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Operational Events -->
    <div class="bg-white shadow rounded-lg">
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900">Recent Operational Events</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each operationalEvents.slice(0, 10) as event}
              <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {event.event_type}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {event.metric_value} {event.metric_unit || ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(event.recorded_at).toLocaleString()}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Last Updated -->
  <div class="text-center text-sm text-gray-500">
    Last updated: {new Date(lastUpdated).toLocaleString()}
  </div>
</div>
