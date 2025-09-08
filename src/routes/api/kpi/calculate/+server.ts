/**
 * KPI Calculation API - Manual KPI calculation trigger
 * Allows manual triggering of KPI calculations for specific time periods
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { KPIMetricsService } from '$lib/server/kpi-metrics-server';
import { authenticateAdminApiRequest } from '$lib/session';
import { ApiErrorHandler } from '$lib/api-error-handler';
import { PerformanceMonitor } from '$lib/performance-monitor';

export const POST: RequestHandler = async ({ request, locals }) => {
  return PerformanceMonitor.monitorApiRoute('kpi-calculate', 'POST', async () => {
    // Declare user in outer scope to avoid reference errors in catch
    let user: any = null;
    
    try {
      // Check authentication with admin privileges
      const { user: authenticatedUser } = await authenticateAdminApiRequest({ request, locals });
      user = authenticatedUser;

      // Parse request body
      const body = await request.json();
      const { startTime, endTime, timePeriod } = body;

      // Validate required parameters
      if (!startTime || !endTime || !timePeriod) {
        return json(
          { error: 'Missing required parameters: startTime, endTime, timePeriod' },
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

      // Validate date format
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return json(
          { error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)' },
          { status: 400 }
        );
      }

      if (startDate >= endDate) {
        return json(
          { error: 'Start time must be before end time' },
          { status: 400 }
        );
      }

      // Check if the time range is reasonable (not more than 1 year)
      const timeDiff = endDate.getTime() - startDate.getTime();
      const oneYear = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds

      if (timeDiff > oneYear) {
        return json(
          { error: 'Time range cannot exceed 1 year' },
          { status: 400 }
        );
      }

      // Trigger KPI calculation
      const metricsCalculated = await KPIMetricsService.calculateKPIs(startTime, endTime, timePeriod);

      return json({
        success: true,
        data: {
          metricsCalculated,
          timeRange: {
            startTime,
            endTime,
            timePeriod
          },
          calculatedAt: new Date().toISOString()
        },
        message: `Successfully calculated ${metricsCalculated} KPI metrics for ${timePeriod} period`
      });

    } catch (error) {
      return ApiErrorHandler.handleError(error as Error, { request, locals }, {
        operation: 'calculate_kpis',
        userId: user?.id
      });
    }
  });
};
