<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { KPIDashboardData } from '$lib/kpi-metrics-types';
  import MetricCard from '$lib/components/MetricCard.svelte';
  import Chart from '$lib/components/Chart.svelte';
  
  export let data;
  
  let dashboardData: KPIDashboardData = data.dashboardData;
  let timeRange = data.timeRange;
  let lastUpdated = data.lastUpdated;
  let isLoading = false;
  let error: string | null = data.error || null;
  
  // Auto-refresh data every 30 seconds
  let refreshInterval: NodeJS.Timeout;
  
  onMount(() => {
    refreshInterval = setInterval(refreshData, 30000);
    return () => clearInterval(refreshInterval);
  });
  
  async function refreshData() {
    isLoading = true;
    try {
      const response = await fetch(`/api/kpi/dashboard?timeRange=${timeRange}`);
      const result = await response.json();
      
      if (result.success) {
        dashboardData = result.data;
        lastUpdated = result.generatedAt;
        error = null;
      } else {
        error = 'Failed to refresh data';
      }
    } catch (err) {
      error = 'Network error while refreshing data';
      console.error('Error refreshing dashboard data:', err);
    } finally {
      isLoading = false;
    }
  }
  
  function changeTimeRange(newRange: string) {
    timeRange = newRange;
    refreshData();
  }
  
  // Calculate key metrics
  $: gmv = dashboardData.financial
    .filter(m => m.metric_name === 'gmv_cents')
    .reduce((sum, m) => sum + m.metric_value, 0);
    
  $: totalOrders = dashboardData.financial
    .filter(m => m.metric_name === 'order_count')
    .reduce((sum, m) => sum + m.metric_value, 0);
    
  $: activeUsers = dashboardData.business
    .filter(m => m.metric_name === 'active_users')
    .reduce((sum, m) => sum + m.metric_value, 0);
    
  $: systemHealth = dashboardData.operational
    .filter(m => m.metric_name === 'system_health_score')
    .slice(-1)[0]?.metric_value || 100;
    
  $: avgResponseTime = dashboardData.performance
    .filter(m => m.metric_name === 'avg_response_time_ms')
    .slice(-1)[0]?.metric_value || 0;
    
  $: errorRate = dashboardData.operational
    .filter(m => m.metric_name === 'error_rate_percent')
    .slice(-1)[0]?.metric_value || 0;
</script>

<svelte:head>
  <title>Executive Dashboard - Aussie Market</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header Controls -->
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Executive Dashboard</h1>
      <p class="text-gray-600 mt-1">Key business metrics and system health overview</p>
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
          <h3 class="text-sm font-medium text-red-800">Error loading dashboard data</h3>
          <div class="mt-2 text-sm text-red-700">
            <p>{error}</p>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Key Metrics Cards -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    <MetricCard
      title="Gross Merchandise Value"
      value={`$${(gmv / 100).toLocaleString()}`}
      icon="💰"
      color="green"
      loading={isLoading}
    />
    
    <MetricCard
      title="Total Orders"
      value={totalOrders.toLocaleString()}
      icon="📋"
      color="blue"
      loading={isLoading}
    />
    
    <MetricCard
      title="Active Users"
      value={activeUsers.toLocaleString()}
      icon="👥"
      color="purple"
      loading={isLoading}
    />
    
    <MetricCard
      title="System Health"
      value={`${systemHealth.toFixed(1)}%`}
      icon="💚"
      color={systemHealth >= 90 ? 'green' : systemHealth >= 70 ? 'yellow' : 'red'}
      loading={isLoading}
    />
  </div>

  <!-- Performance Metrics -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Response Time -->
    <div class="bg-white shadow rounded-lg p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Average Response Time</h3>
      <div class="flex items-center">
        <div class="text-3xl font-bold text-gray-900">{avgResponseTime.toFixed(0)}ms</div>
        <div class="ml-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {avgResponseTime < 200 ? 'bg-green-100 text-green-800' : avgResponseTime < 500 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
            {avgResponseTime < 200 ? 'Excellent' : avgResponseTime < 500 ? 'Good' : 'Needs Attention'}
          </span>
        </div>
      </div>
    </div>

    <!-- Error Rate -->
    <div class="bg-white shadow rounded-lg p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Error Rate</h3>
      <div class="flex items-center">
        <div class="text-3xl font-bold {errorRate < 1 ? 'text-green-600' : errorRate < 5 ? 'text-yellow-600' : 'text-red-600'}">{errorRate.toFixed(2)}%</div>
        <div class="ml-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {errorRate < 1 ? 'bg-green-100 text-green-800' : errorRate < 5 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
            {errorRate < 1 ? 'Low' : errorRate < 5 ? 'Moderate' : 'High'}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Charts Section -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <Chart
      title="GMV Trend"
      data={dashboardData.financial.filter(m => m.metric_name === 'gmv_cents')}
      type="line"
      color="#10b981"
      showGrid={true}
    />
    
    <Chart
      title="Order Volume"
      data={dashboardData.financial.filter(m => m.metric_name === 'order_count')}
      type="bar"
      color="#3b82f6"
      showGrid={true}
    />
    
    <Chart
      title="Active Users"
      data={dashboardData.business.filter(m => m.metric_name === 'active_users')}
      type="area"
      color="#8b5cf6"
      showGrid={true}
    />
    
    <Chart
      title="System Uptime"
      data={dashboardData.operational.filter(m => m.metric_name === 'system_uptime_percent')}
      type="line"
      color="#f59e0b"
      showGrid={true}
    />
  </div>

  <!-- Quick Actions -->
  <div class="bg-white shadow rounded-lg p-6">
    <h3 class="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <button
        class="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        on:click={() => goto('/dashboard/operations')}
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Operations
      </button>
      
      <button
        class="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        on:click={() => goto('/dashboard/business')}
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Business Intelligence
      </button>
      
      <button
        class="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        on:click={() => goto('/dashboard/technical')}
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Technical
      </button>
      
      <button
        class="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        on:click={() => goto('/admin')}
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Admin Panel
      </button>
    </div>
  </div>

  <!-- Last Updated -->
  <div class="text-center text-sm text-gray-500">
    Last updated: {new Date(lastUpdated).toLocaleString()}
  </div>
</div>
