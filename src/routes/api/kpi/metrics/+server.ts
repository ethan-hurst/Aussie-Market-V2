/**
 * KPI Metrics API - Detailed metrics and trends
 * Provides detailed KPI metrics data for analysis and reporting
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { KPIMetricsService } from '$lib/kpi-metrics';
import { getSessionUserOrThrow } from '$lib/session';
import { ApiErrorHandler } from '$lib/api-error-handler';
import { PerformanceMonitor } from '$lib/performance-monitor';

export const GET: RequestHandler = async ({ request, locals, url }) => {
  return PerformanceMonitor.monitorApiRoute('kpi-metrics', 'GET', async () => {
    try {
      // Check authentication
      const user = await getSessionUserOrThrow({ request, locals } as any);
      
      // Check if user has admin privileges for KPI access
      if (!user.app_metadata?.role || user.app_metadata.role !== 'admin') {
        return json(
          { error: 'Insufficient permissions to access KPI metrics' },
          { status: 403 }
        );
      }

      // Get query parameters
      const category = url.searchParams.get('category') as any;
      const metricName = url.searchParams.get('metricName');
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const timePeriod = url.searchParams.get('timePeriod') as any || 'daily';
      const days = parseInt(url.searchParams.get('days') || '30');

      // Validate category
      if (category && !['financial', 'business', 'performance', 'operational'].includes(category)) {
        return json(
          { error: 'Invalid category. Must be one of: financial, business, performance, operational' },
          { status: 400 }
        );
      }

      // Validate time period
      if (!['hourly', 'daily', 'weekly', 'monthly'].includes(timePeriod)) {
        return json(
          { error: 'Invalid time period. Must be one of: hourly, daily, weekly, monthly' },
          { status: 400 }
        );
      }

      let result;

      if (metricName && category) {
        // Get specific metric trends
        result = await KPIMetricsService.getMetricTrends(metricName, category, days);
      } else if (category && startDate && endDate) {
        // Get metrics by category and date range
        result = await KPIMetricsService.getMetricsByCategory(category, startDate, endDate, timePeriod);
      } else if (startDate && endDate) {
        // Get KPI summary for date range
        result = await KPIMetricsService.getKPISummary(startDate, endDate, timePeriod);
      } else {
        return json(
          { error: 'Missing required parameters. Provide either (category, startDate, endDate) or (metricName, category, days)' },
          { status: 400 }
        );
      }

      return json({
        success: true,
        data: result,
        parameters: {
          category,
          metricName,
          startDate,
          endDate,
          timePeriod,
          days
        },
        generatedAt: new Date().toISOString()
      });

    } catch (error) {
      return ApiErrorHandler.handleError(error as Error, { request, locals } as any, {
        operation: 'get_kpi_metrics',
        userId: user?.id
      });
    }
  });
};
