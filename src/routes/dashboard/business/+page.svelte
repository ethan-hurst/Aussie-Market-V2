<script lang="ts">
  import { onMount } from 'svelte';
  
  export let data;
  
  let businessData = data.businessData;
  let financialData = data.financialData;
  let businessEvents = data.businessEvents;
  let financialEvents = data.financialEvents;
  let timeRange = data.timeRange;
  let lastUpdated = data.lastUpdated;
  let isLoading = false;
  let error: string | null = data.error || null;
  
  // Auto-refresh data every 30 seconds for business metrics
  let refreshInterval: NodeJS.Timeout;
  
  onMount(() => {
    refreshInterval = setInterval(refreshData, 30000);
    return () => clearInterval(refreshInterval);
  });
  
  async function refreshData() {
    isLoading = true;
    try {
      const [businessResponse, financialResponse, businessEventsResponse, financialEventsResponse] = await Promise.all([
        fetch(`/api/kpi/dashboard?timeRange=${timeRange}&category=business`),
        fetch(`/api/kpi/dashboard?timeRange=${timeRange}&category=financial`),
        fetch('/api/kpi/events?category=business&limit=50'),
        fetch('/api/kpi/events?category=financial&limit=50')
      ]);
      
      const [businessResult, financialResult, businessEventsResult, financialEventsResult] = await Promise.all([
        businessResponse.json(),
        financialResponse.json(),
        businessEventsResponse.json(),
        financialEventsResponse.json()
      ]);
      
      if (businessResult.success) {
        businessData = businessResult.data;
      }
      if (financialResult.success) {
        financialData = financialResult.data;
      }
      if (businessEventsResult.success) {
        businessEvents = businessEventsResult.data;
      }
      if (financialEventsResult.success) {
        financialEvents = financialEventsResult.data;
      }
      
      lastUpdated = new Date().toISOString();
      error = null;
    } catch (err) {
      error = 'Network error while refreshing data';
      console.error('Error refreshing business data:', err);
    } finally {
      isLoading = false;
    }
  }
  
  function changeTimeRange(newRange: string) {
    timeRange = newRange;
    refreshData();
  }
  
  // Calculate business metrics
  $: totalGMV = financialData.financial
    .filter((m: any) => m.metric_name === 'gmv_cents')
    .reduce((sum: number, m: any) => sum + m.metric_value, 0);
    
  $: totalOrders = financialData.financial
    .filter((m: any) => m.metric_name === 'order_count')
    .reduce((sum: number, m: any) => sum + m.metric_value, 0);
    
  $: avgOrderValue = totalOrders > 0 ? totalGMV / totalOrders : 0;
    
  $: activeUsers = businessData.business
    .filter((m: any) => m.metric_name === 'active_users')
    .reduce((sum: number, m: any) => sum + m.metric_value, 0);
    
  $: newListings = businessData.business
    .filter((m: any) => m.metric_name === 'new_listings')
    .reduce((sum: number, m: any) => sum + m.metric_value, 0);
    
  $: totalBids = businessData.business
    .filter((m: any) => m.metric_name === 'total_bids')
    .reduce((sum: number, m: any) => sum + m.metric_value, 0);
    
  $: disputeRate = businessData.business
    .filter((m: any) => m.metric_name === 'dispute_rate_percent')
    .slice(-1)[0]?.metric_value || 0;
    
  $: attachRate = businessData.business
    .filter((m: any) => m.metric_name === 'attach_rate_percent')
    .slice(-1)[0]?.metric_value || 0;
</script>

<svelte:head>
  <title>Business Intelligence Dashboard - Aussie Market</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header Controls -->
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Business Intelligence Dashboard</h1>
      <p class="text-gray-600 mt-1">Auction performance, user analytics, and revenue analysis</p>
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
        <button
          class="px-3 py-2 text-sm font-medium border border-gray-300 rounded-r-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {timeRange === '90d' ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-700'}"
          on:click={() => changeTimeRange('90d')}
        >
          90d
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
          <h3 class="text-sm font-medium text-red-800">Error loading business data</h3>
          <div class="mt-2 text-sm text-red-700">
            <p>{error}</p>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Key Business Metrics -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    <!-- Total GMV -->
    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Total GMV</dt>
              <dd class="text-lg font-medium text-gray-900">${(totalGMV / 100).toLocaleString()}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <!-- Total Orders -->
    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Total Orders</dt>
              <dd class="text-lg font-medium text-gray-900">{totalOrders.toLocaleString()}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <!-- Average Order Value -->
    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Avg Order Value</dt>
              <dd class="text-lg font-medium text-gray-900">${(avgOrderValue / 100).toFixed(2)}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <!-- Active Users -->
    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Active Users</dt>
              <dd class="text-lg font-medium text-gray-900">{activeUsers.toLocaleString()}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Auction Performance Metrics -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- New Listings -->
    <div class="bg-white shadow rounded-lg p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">New Listings</h3>
      <div class="flex items-center">
        <div class="text-3xl font-bold text-blue-600">{newListings.toLocaleString()}</div>
        <div class="ml-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            This {timeRange}
          </span>
        </div>
      </div>
    </div>

    <!-- Total Bids -->
    <div class="bg-white shadow rounded-lg p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Total Bids</h3>
      <div class="flex items-center">
        <div class="text-3xl font-bold text-green-600">{totalBids.toLocaleString()}</div>
        <div class="ml-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            This {timeRange}
          </span>
        </div>
      </div>
    </div>

    <!-- Dispute Rate -->
    <div class="bg-white shadow rounded-lg p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Dispute Rate</h3>
      <div class="flex items-center">
        <div class="text-3xl font-bold {disputeRate < 2 ? 'text-green-600' : disputeRate < 5 ? 'text-yellow-600' : 'text-red-600'}">{disputeRate.toFixed(2)}%</div>
        <div class="ml-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {disputeRate < 2 ? 'bg-green-100 text-green-800' : disputeRate < 5 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
            {disputeRate < 2 ? 'Low' : disputeRate < 5 ? 'Moderate' : 'High'}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Attach Rate -->
  <div class="bg-white shadow rounded-lg p-6">
    <h3 class="text-lg font-medium text-gray-900 mb-4">Attach Rate</h3>
    <div class="flex items-center">
      <div class="text-4xl font-bold {attachRate >= 80 ? 'text-green-600' : attachRate >= 60 ? 'text-yellow-600' : 'text-red-600'}">{attachRate.toFixed(1)}%</div>
      <div class="ml-6 flex-1">
        <div class="bg-gray-200 rounded-full h-4">
          <div class="bg-blue-600 h-4 rounded-full transition-all duration-300" style="width: {attachRate}%"></div>
        </div>
        <p class="text-sm text-gray-600 mt-2">
          {attachRate >= 80 ? 'Excellent conversion rate' : attachRate >= 60 ? 'Good conversion rate' : 'Needs improvement'}
        </p>
      </div>
    </div>
  </div>

  <!-- Recent Business Events -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Business Events -->
    <div class="bg-white shadow rounded-lg">
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900">Recent Business Events</h3>
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
            {#each businessEvents.slice(0, 10) as event}
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

    <!-- Financial Events -->
    <div class="bg-white shadow rounded-lg">
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900">Recent Financial Events</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each financialEvents.slice(0, 10) as event}
              <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {event.event_type}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  ${(event.metric_value / 100).toFixed(2)}
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
