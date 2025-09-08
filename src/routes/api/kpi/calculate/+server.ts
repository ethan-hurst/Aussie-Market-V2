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
import { KPICalculationSchema, validate } from '$lib/validation';

export const POST: RequestHandler = async ({ request, locals }) => {
  return PerformanceMonitor.monitorApiRoute('kpi-calculate', 'POST', async () => {
    // Declare user in outer scope to avoid reference errors in catch
    let user: any = null;
    
    try {
      // Check authentication with admin privileges
      const { user: authenticatedUser } = await authenticateAdminApiRequest({ request, locals });
      user = authenticatedUser;

      // Parse and validate request body
      const body = await request.json();
      const validation = validate(KPICalculationSchema, body);
      
      if (!validation.ok) {
        return json(
          { error: 'Invalid request data', details: validation.error },
          { status: 400 }
        );
      }
      
      const { startTime, endTime, timePeriod } = validation.value;

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
