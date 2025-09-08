import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  try {
    const timeRange = url.searchParams.get('timeRange') || '7d';
    
    // Get operational metrics from KPI API
    const response = await fetch(`/api/kpi/dashboard?timeRange=${timeRange}&category=operational`);
    const operationalData = await response.json();
    
    // Get performance metrics
    const perfResponse = await fetch(`/api/kpi/dashboard?timeRange=${timeRange}&category=performance`);
    const performanceData = await perfResponse.json();
    
    // Get recent events
    const eventsResponse = await fetch('/api/kpi/events?category=operational&limit=50');
    const eventsData = await eventsResponse.json();

    return {
      operationalData: operationalData.success ? operationalData.data : { operational: [], lastUpdated: new Date().toISOString() },
      performanceData: performanceData.success ? performanceData.data : { performance: [], lastUpdated: new Date().toISOString() },
      eventsData: eventsData.success ? eventsData.data : [],
      timeRange,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error loading operations dashboard data:', error);
    return {
      operationalData: { operational: [], lastUpdated: new Date().toISOString() },
      performanceData: { performance: [], lastUpdated: new Date().toISOString() },
      eventsData: [],
      timeRange: '7d',
      lastUpdated: new Date().toISOString(),
      error: 'Failed to load operations data'
    };
  }
};
