/**
 * KPI Events API - Real-time KPI events
 * Provides real-time KPI events for monitoring and alerting
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { KPIMetricsService } from '$lib/server/kpi-metrics-server';
import { getSessionUserFromLocals } from '$lib/session';
import { ApiErrorHandler } from '$lib/api-error-handler';
import { PerformanceMonitor } from '$lib/performance-monitor';

export const GET: RequestHandler = async ({ request, locals, url }) => {
  return PerformanceMonitor.monitorApiRoute('kpi-events', 'GET', async () => {
    try {
      // Check authentication
      const user = await getSessionUserFromLocals(locals);
      
      // Check if user has admin privileges for KPI access
      if (!user.app_metadata?.role || user.app_metadata.role !== 'admin') {
        return json(
          { error: 'Insufficient permissions to access KPI events' },
          { status: 403 }
        );
      }

      // Get query parameters
      const category = url.searchParams.get('category') as any;
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const eventType = url.searchParams.get('eventType');
      const userId = url.searchParams.get('userId');
      const orderId = url.searchParams.get('orderId');
      const listingId = url.searchParams.get('listingId');
      const auctionId = url.searchParams.get('auctionId');

      // Validate category if provided
      if (category && !['financial', 'business', 'performance', 'operational'].includes(category)) {
        return json(
          { error: 'Invalid category. Must be one of: financial, business, performance, operational' },
          { status: 400 }
        );
      }

      // Validate limit
      if (limit < 1 || limit > 1000) {
        return json(
          { error: 'Limit must be between 1 and 1000' },
          { status: 400 }
        );
      }

      // Get recent events
      const events = await KPIMetricsService.getRecentEvents(category, limit);

      // Filter events by additional parameters if provided
      let filteredEvents = events;

      if (eventType) {
        filteredEvents = filteredEvents.filter(event => event.event_type === eventType);
      }

      if (userId) {
        filteredEvents = filteredEvents.filter(event => event.user_id === userId);
      }

      if (orderId) {
        filteredEvents = filteredEvents.filter(event => event.order_id === orderId);
      }

      if (listingId) {
        filteredEvents = filteredEvents.filter(event => event.listing_id === listingId);
      }

      if (auctionId) {
        filteredEvents = filteredEvents.filter(event => event.auction_id === auctionId);
      }

      // Group events by category for easier consumption
      const eventsByCategory = {
        financial: filteredEvents.filter(e => e.category === 'financial'),
        business: filteredEvents.filter(e => e.category === 'business'),
        performance: filteredEvents.filter(e => e.category === 'performance'),
        operational: filteredEvents.filter(e => e.category === 'operational')
      };

      return json({
        success: true,
        data: {
          events: filteredEvents,
          eventsByCategory,
          totalCount: filteredEvents.length,
          parameters: {
            category,
            limit,
            eventType,
            userId,
            orderId,
            listingId,
            auctionId
          }
        },
        generatedAt: new Date().toISOString()
      });

    } catch (error) {
      // Handle authentication errors gracefully
      if (error instanceof Response) {
        return error;
      }
      return ApiErrorHandler.handleError(error as Error, { request, locals, url }, {
        operation: 'get_kpi_events',
        userId: user?.id
      });
    }
  });
};
