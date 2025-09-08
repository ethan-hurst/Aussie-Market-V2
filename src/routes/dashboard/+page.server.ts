import type { PageServerLoad } from './$types';
import { KPIMetricsService } from '$lib/kpi-metrics';

export const load: PageServerLoad = async ({ fetch, url }) => {
  try {
    // Get dashboard data from KPI API
    const response = await fetch('/api/kpi/dashboard?timeRange=7d');
    const dashboardData = await response.json();
    
    if (!dashboardData.success) {
      throw new Error('Failed to fetch dashboard data');
    }

    return {
      dashboardData: dashboardData.data,
      timeRange: dashboardData.timeRange || '7d',
      lastUpdated: dashboardData.generatedAt
    };
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    return {
      dashboardData: {
        financial: [],
        business: [],
        performance: [],
        operational: [],
        lastUpdated: new Date().toISOString()
      },
      timeRange: '7d',
      lastUpdated: new Date().toISOString(),
      error: 'Failed to load dashboard data'
    };
  }
};
