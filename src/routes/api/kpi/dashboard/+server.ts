/**
 * KPI Dashboard API - Real-time metrics dashboard backend
 * Provides comprehensive KPI data for business intelligence dashboard
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { KPIMetricsService } from '$lib/kpi-metrics';
import { getSessionUserOrThrow } from '$lib/session';
import { ApiErrorHandler } from '$lib/api-error-handler';
import { PerformanceMonitor } from '$lib/performance-monitor';

export const GET: RequestHandler = async ({ request, locals, url }) => {
  return PerformanceMonitor.monitorApiRoute('kpi-dashboard', 'GET', async () => {
    try {
      // Check authentication
      const user = await getSessionUserOrThrow({ request, locals } as any);
      
      // Check if user has admin privileges for KPI access
      if (!user.app_metadata?.role || user.app_metadata.role !== 'admin') {
        return json(
          { error: 'Insufficient permissions to access KPI dashboard' },
          { status: 403 }
        );
      }

      // Get query parameters
      const timeRange = url.searchParams.get('timeRange') || '7d';
      const category = url.searchParams.get('category') as any;
      const refresh = url.searchParams.get('refresh') === 'true';

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timeRange) {
        case '1d':
          startDate.setDate(endDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        default:
          startDate.setDate(endDate.getDate() - 7);
      }

      // Get dashboard data
      const dashboardData = await KPIMetricsService.getDashboardData();

      // If specific category requested, filter data
      if (category && ['financial', 'business', 'performance', 'operational'].includes(category)) {
        const filteredData = {
          [category]: dashboardData[category],
          lastUpdated: dashboardData.lastUpdated
        };
        
        return json({
          success: true,
          data: filteredData,
          timeRange,
          category,
          generatedAt: new Date().toISOString()
        });
      }

      // Return full dashboard data
      return json({
        success: true,
        data: dashboardData,
        timeRange,
        generatedAt: new Date().toISOString()
      });

    } catch (error) {
      return ApiErrorHandler.handleError(error as Error, { request, locals } as any, {
        operation: 'get_kpi_dashboard',
        userId: user?.id
      });
    }
  });
};
