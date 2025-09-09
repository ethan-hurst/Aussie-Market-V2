/**
 * KPI Reports API - Automated reporting and alerting
 * Generates comprehensive KPI reports and manages alert rules
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { KPIReportingService } from '$lib/kpi-reporting';
import { getSessionUserFromLocals } from '$lib/session';
import { ApiErrorHandler } from '$lib/api-error-handler';
import { PerformanceMonitor } from '$lib/performance-monitor';

export const GET: RequestHandler = async ({ request, locals, url }) => {
  return PerformanceMonitor.monitorApiRoute('kpi-reports', 'GET', async () => {
    // Declare user in outer scope to avoid reference errors in catch
    let user: any = null;
    
    try {
      // Check authentication
      user = await getSessionUserFromLocals(locals);
      
      // Check if user has admin privileges for KPI access
      if (!user.app_metadata?.role || user.app_metadata.role !== 'admin') {
        return json(
          { error: 'Insufficient permissions to access KPI reports' },
          { status: 403 }
        );
      }

      // Get query parameters
      const reportType = url.searchParams.get('type') as any;
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');

      // Validate report type
      if (reportType && !['daily', 'weekly', 'monthly'].includes(reportType)) {
        return json(
          { error: 'Invalid report type. Must be one of: daily, weekly, monthly' },
          { status: 400 }
        );
      }

      // Generate report
      const customPeriod = startDate && endDate ? { start: startDate, end: endDate } : undefined;
      const report = await KPIReportingService.generateReport(reportType || 'daily', customPeriod);

      return json({
        success: true,
        data: report,
        parameters: {
          reportType,
          startDate,
          endDate
        },
        generatedAt: new Date().toISOString()
      });

    } catch (error) {
      // Handle authentication errors gracefully
      if (error instanceof Response) {
        return error;
      }
      return ApiErrorHandler.handleError(error as Error, { request, locals, url }, {
        operation: 'get_kpi_reports',
        userId: user?.id
      });
    }
  });
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
  return PerformanceMonitor.monitorApiRoute('kpi-reports', 'POST', async () => {
    // Declare user in outer scope to avoid reference errors in catch
    let user: any = null;
    
    try {
      // Check authentication
      user = await getSessionUserFromLocals(locals);
      
      // Check if user has admin privileges for KPI access
      if (!user.app_metadata?.role || user.app_metadata.role !== 'admin') {
        return json(
          { error: 'Insufficient permissions to manage KPI reports' },
          { status: 403 }
        );
      }

      // Parse request body
      const body = await request.json();
      const { action, reportType, startDate, endDate, alertRule } = body;

      switch (action) {
        case 'generate_report':
          // Generate custom report
          const customPeriod = startDate && endDate ? { start: startDate, end: endDate } : undefined;
          const report = await KPIReportingService.generateReport(reportType || 'daily', customPeriod);
          
          return json({
            success: true,
            data: report,
            message: 'Report generated successfully'
          });

        case 'add_alert_rule':
          // Add new alert rule
          if (!alertRule) {
            return json(
              { error: 'Alert rule data is required' },
              { status: 400 }
            );
          }

          const ruleId = KPIReportingService.addAlertRule(alertRule);
          
          return json({
            success: true,
            data: { ruleId },
            message: 'Alert rule added successfully'
          });

        case 'update_alert_rule':
          // Update existing alert rule
          if (!alertRule?.id) {
            return json(
              { error: 'Alert rule ID is required' },
              { status: 400 }
            );
          }

          const updated = KPIReportingService.updateAlertRule(alertRule.id, alertRule);
          
          if (!updated) {
            return json(
              { error: 'Alert rule not found' },
              { status: 404 }
            );
          }

          return json({
            success: true,
            message: 'Alert rule updated successfully'
          });

        case 'remove_alert_rule':
          // Remove alert rule
          if (!alertRule?.id) {
            return json(
              { error: 'Alert rule ID is required' },
              { status: 400 }
            );
          }

          const removed = KPIReportingService.removeAlertRule(alertRule.id);
          
          if (!removed) {
            return json(
              { error: 'Alert rule not found' },
              { status: 404 }
            );
          }

          return json({
            success: true,
            message: 'Alert rule removed successfully'
          });

        default:
          return json(
            { error: 'Invalid action. Must be one of: generate_report, add_alert_rule, update_alert_rule, remove_alert_rule' },
            { status: 400 }
          );
      }

    } catch (error) {
      // Handle authentication errors gracefully
      if (error instanceof Response) {
        return error;
      }
      return ApiErrorHandler.handleError(error as Error, { request, locals, url }, {
        operation: 'manage_kpi_reports',
        userId: user?.id
      });
    }
  });
};
