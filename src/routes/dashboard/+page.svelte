<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { KPIDashboardData } from '$lib/kpi-metrics-types';
  import MetricCard from '$lib/components/MetricCard.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
  import MetricCardFallback from '$lib/components/MetricCardFallback.svelte';
  import {
    safeDashboardData,
    safeMetricSum,
    safeMetricLatest,
    safeCurrencyFormat,
    safeNumberFormat,
    safePercentFormat,
    isDashboardDataEmpty,
    getHealthColor,
    safeDateParse
  } from '$lib/utils/dashboard-utils';
  
  export let data;
  
  let rawDashboardData: KPIDashboardData | null = data?.dashboardData || null;
  let timeRange = data?.timeRange || '7d';
  let lastUpdated = data?.lastUpdated || new Date().toISOString();
  let isLoading = false;
  let error: string | null = data?.error || null;
  
  // Safe dashboard data access
  $: dashboardData = safeDashboardData(rawDashboardData);
  $: isEmpty = isDashboardDataEmpty(rawDashboardData);
  
  // Auto-refresh data every 30 seconds
  let refreshInterval: NodeJS.Timeout;
  
  onMount(() => {
    refreshInterval = setInterval(refreshData, 30000);
    return () => clearInterval(refreshInterval);
  });
  
  async function refreshData() {
    isLoading = true;
    error = null;
    
    try {
      const response = await fetch(`/api/kpi/dashboard?timeRange=${timeRange}&refresh=true`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data) {
        rawDashboardData = result.data;
        lastUpdated = result.generatedAt || new Date().toISOString();
        error = null;
      } else {
        throw new Error(result.message || 'Failed to refresh data');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      error = `Unable to refresh dashboard: ${errorMessage}`;
      console.error('Error refreshing dashboard data:', err);
    } finally {
      isLoading = false;
    }
  }
  
  function changeTimeRange(newRange: string) {
    timeRange = newRange;
    refreshData();
  }
  
  // Calculate key metrics with safe data access
  $: gmv = safeMetricSum(dashboardData.financial, 'gmv_cents', 0);
  $: totalOrders = safeMetricSum(dashboardData.financial, 'order_count', 0);
  $: activeUsers = safeMetricSum(dashboardData.business, 'active_users', 0);
  $: systemHealth = safeMetricLatest(dashboardData.operational, 'system_health_score', 100);
  $: avgResponseTime = safeMetricLatest(dashboardData.performance, 'avg_response_time_ms', 0);
  $: errorRate = safeMetricLatest(dashboardData.operational, 'error_rate_percent', 0);
  
  // Format values safely
  $: gmvFormatted = safeCurrencyFormat(gmv / 100);
  $: totalOrdersFormatted = safeNumberFormat(totalOrders);
  $: activeUsersFormatted = safeNumberFormat(activeUsers);
  $: systemHealthFormatted = safePercentFormat(systemHealth);
  $: avgResponseTimeFormatted = `${avgResponseTime.toFixed(0)}ms`;
  $: errorRateFormatted = safePercentFormat(errorRate, 2);
  
  // Health status colors
  $: systemHealthColor = getHealthColor(systemHealth, 90, 70);
  $: responseTimeColor = getHealthColor(500 - avgResponseTime, 300, 200); // Inverted for response time
  $: errorRateColor = getHealthColor(10 - errorRate, 9, 5); // Inverted for error rate
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
    <ErrorBoundary fallbackMessage={error} retryable={true} on:retry={refreshData}>
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
    </ErrorBoundary>
  {/if}
  
  <!-- Empty State -->
  {#if !error && isEmpty && !isLoading}
    <div class="text-center py-12">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No dashboard data available</h3>
      <p class="mt-1 text-sm text-gray-500">Try refreshing or selecting a different time range.</p>
      <div class="mt-6">
        <button
          type="button"
          class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          on:click={refreshData}
        >
          Refresh Data
        </button>
      </div>
    </div>
  {/if}

  <!-- Key Metrics Cards -->
  {#if !isEmpty || isLoading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <ErrorBoundary fallbackComponent={MetricCardFallback} fallbackMessage="Unable to load GMV metric">
        <MetricCard
          title="Gross Merchandise Value"
          value={gmvFormatted}
          icon="💰"
          color="green"
          loading={isLoading}
        />
      </ErrorBoundary>
      
      <ErrorBoundary fallbackComponent={MetricCardFallback} fallbackMessage="Unable to load orders metric">
        <MetricCard
          title="Total Orders"
          value={totalOrdersFormatted}
          icon="📋"
          color="blue"
          loading={isLoading}
        />
      </ErrorBoundary>
      
      <ErrorBoundary fallbackComponent={MetricCardFallback} fallbackMessage="Unable to load users metric">
        <MetricCard
          title="Active Users"
          value={activeUsersFormatted}
          icon="👥"
          color="purple"
          loading={isLoading}
        />
      </ErrorBoundary>
      
      <ErrorBoundary fallbackComponent={MetricCardFallback} fallbackMessage="Unable to load health metric">
        <MetricCard
          title="System Health"
          value={systemHealthFormatted}
          icon="💚"
          color={systemHealthColor}
          loading={isLoading}
        />
      </ErrorBoundary>
    </div>
  {/if}

  <!-- Performance Metrics -->
  {#if !isEmpty || isLoading}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Response Time -->
      <ErrorBoundary fallbackMessage="Unable to load response time metric">
        <div class="bg-white shadow rounded-lg p-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Average Response Time</h3>
          <div class="flex items-center">
            <div class="text-3xl font-bold text-gray-900">{avgResponseTimeFormatted}</div>
            <div class="ml-4">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {responseTimeColor === 'green' ? 'bg-green-100 text-green-800' : responseTimeColor === 'yellow' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
                {responseTimeColor === 'green' ? 'Excellent' : responseTimeColor === 'yellow' ? 'Good' : 'Needs Attention'}
              </span>
            </div>
          </div>
        </div>
      </ErrorBoundary>

      <!-- Error Rate -->
      <ErrorBoundary fallbackMessage="Unable to load error rate metric">
        <div class="bg-white shadow rounded-lg p-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Error Rate</h3>
          <div class="flex items-center">
            <div class="text-3xl font-bold {errorRateColor === 'green' ? 'text-green-600' : errorRateColor === 'yellow' ? 'text-yellow-600' : 'text-red-600'}">{errorRateFormatted}</div>
            <div class="ml-4">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {errorRateColor === 'green' ? 'bg-green-100 text-green-800' : errorRateColor === 'yellow' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
                {errorRateColor === 'green' ? 'Low' : errorRateColor === 'yellow' ? 'Moderate' : 'High'}
              </span>
            </div>
          </div>
        </div>
      </ErrorBoundary>
    </div>
  {/if}

  <!-- Charts Section -->
  {#if !isEmpty || isLoading}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ErrorBoundary fallbackMessage="Unable to load GMV chart">
        <Chart
          title="GMV Trend"
          data={dashboardData.financial.filter(m => m?.metric_name === 'gmv_cents') || []}
          type="line"
          color="#10b981"
          showGrid={true}
        />
      </ErrorBoundary>
      
      <ErrorBoundary fallbackMessage="Unable to load order volume chart">
        <Chart
          title="Order Volume"
          data={dashboardData.financial.filter(m => m?.metric_name === 'order_count') || []}
          type="bar"
          color="#3b82f6"
          showGrid={true}
        />
      </ErrorBoundary>
      
      <ErrorBoundary fallbackMessage="Unable to load active users chart">
        <Chart
          title="Active Users"
          data={dashboardData.business.filter(m => m?.metric_name === 'active_users') || []}
          type="area"
          color="#8b5cf6"
          showGrid={true}
        />
      </ErrorBoundary>
      
      <ErrorBoundary fallbackMessage="Unable to load system uptime chart">
        <Chart
          title="System Uptime"
          data={dashboardData.operational.filter(m => m?.metric_name === 'system_uptime_percent') || []}
          type="line"
          color="#f59e0b"
          showGrid={true}
        />
      </ErrorBoundary>
    </div>
  {/if}

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
  {#if lastUpdated && !isEmpty}
    <div class="text-center text-sm text-gray-500">
      Last updated: {safeDateParse(lastUpdated).toLocaleString()}
    </div>
  {/if}
</div>
