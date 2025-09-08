import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  try {
    const timeRange = url.searchParams.get('timeRange') || '7d';
    
    // Get business metrics from KPI API
    const response = await fetch(`/api/kpi/dashboard?timeRange=${timeRange}&category=business`);
    const businessData = await response.json();
    
    // Get financial metrics
    const financialResponse = await fetch(`/api/kpi/dashboard?timeRange=${timeRange}&category=financial`);
    const financialData = await financialResponse.json();
    
    // Get recent business events
    const eventsResponse = await fetch('/api/kpi/events?category=business&limit=50');
    const businessEvents = await eventsResponse.json();
    
    // Get financial events
    const financialEventsResponse = await fetch('/api/kpi/events?category=financial&limit=50');
    const financialEvents = await financialEventsResponse.json();

    return {
      businessData: businessData.success ? businessData.data : { business: [], lastUpdated: new Date().toISOString() },
      financialData: financialData.success ? financialData.data : { financial: [], lastUpdated: new Date().toISOString() },
      businessEvents: businessEvents.success ? businessEvents.data : [],
      financialEvents: financialEvents.success ? financialEvents.data : [],
      timeRange,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error loading business dashboard data:', error);
    return {
      businessData: { business: [], lastUpdated: new Date().toISOString() },
      financialData: { financial: [], lastUpdated: new Date().toISOString() },
      businessEvents: [],
      financialEvents: [],
      timeRange: '7d',
      lastUpdated: new Date().toISOString(),
      error: 'Failed to load business data'
    };
  }
};
