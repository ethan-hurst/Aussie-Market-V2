import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  try {
    const timeRange = url.searchParams.get('timeRange') || '7d';
    
    // Get performance metrics from KPI API
    const response = await fetch(`/api/kpi/dashboard?timeRange=${timeRange}&category=performance`);
    const performanceData = await response.json();
    
    // Get operational metrics
    const operationalResponse = await fetch(`/api/kpi/dashboard?timeRange=${timeRange}&category=operational`);
    const operationalData = await operationalResponse.json();
    
    // Get recent performance events
    const eventsResponse = await fetch('/api/kpi/events?category=performance&limit=50');
    const performanceEvents = await eventsResponse.json();
    
    // Get operational events
    const operationalEventsResponse = await fetch('/api/kpi/events?category=operational&limit=50');
    const operationalEvents = await operationalEventsResponse.json();

    return {
      performanceData: performanceData.success ? performanceData.data : { performance: [], lastUpdated: new Date().toISOString() },
      operationalData: operationalData.success ? operationalData.data : { operational: [], lastUpdated: new Date().toISOString() },
      performanceEvents: performanceEvents.success ? performanceEvents.data : [],
      operationalEvents: operationalEvents.success ? operationalEvents.data : [],
      timeRange,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error loading technical dashboard data:', error);
    return {
      performanceData: { performance: [], lastUpdated: new Date().toISOString() },
      operationalData: { operational: [], lastUpdated: new Date().toISOString() },
      performanceEvents: [],
      operationalEvents: [],
      timeRange: '7d',
      lastUpdated: new Date().toISOString(),
      error: 'Failed to load technical data'
    };
  }
};
