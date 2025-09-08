/**
 * KPI Alerts API - Alert rules management
 * Manages KPI alert rules and provides alert history
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { KPIReportingService } from '$lib/kpi-reporting';
import { getSessionUserOrThrow } from '$lib/session';
import { ApiErrorHandler } from '$lib/api-error-handler';
import { PerformanceMonitor } from '$lib/performance-monitor';
import { KPIAlertActionSchema, validate } from '$lib/validation';
import { isCsrfRequestValid } from '$lib/security';

export const GET: RequestHandler = async ({ request, locals, url }) => {
  return PerformanceMonitor.monitorApiRoute('kpi-alerts', 'GET', async () => {
    let user: any = undefined;
    try {
      // Check authentication - explicitly read session first
      const session = await locals.getSession();
      if (!session) {
        return json({ error: 'Not authenticated' }, { status: 401 });
      }
      
      user = await getSessionUserOrThrow({ request, locals } as any);
      
      // Check if user has admin privileges for KPI access
      if (!user.app_metadata?.role || user.app_metadata.role !== 'admin') {
        return json(
          { error: 'Insufficient permissions to access KPI alerts' },
          { status: 403 }
        );
      }

      // Get query parameters
      const category = url.searchParams.get('category') as any;
      const severity = url.searchParams.get('severity') as any;
      const enabled = url.searchParams.get('enabled');

      // Get all alert rules
      let alertRules = KPIReportingService.getAlertRules();

      // Filter by category if provided
      if (category && ['financial', 'business', 'performance', 'operational'].includes(category)) {
        alertRules = alertRules.filter(rule => rule.category === category);
      }

      // Filter by severity if provided
      if (severity && ['low', 'medium', 'high', 'critical'].includes(severity)) {
        alertRules = alertRules.filter(rule => rule.severity === severity);
      }

      // Filter by enabled status if provided
      if (enabled !== null) {
        const isEnabled = enabled === 'true';
        alertRules = alertRules.filter(rule => rule.enabled === isEnabled);
      }

      // Group rules by category for easier consumption
      const rulesByCategory = {
        financial: alertRules.filter(rule => rule.category === 'financial'),
        business: alertRules.filter(rule => rule.category === 'business'),
        performance: alertRules.filter(rule => rule.category === 'performance'),
        operational: alertRules.filter(rule => rule.category === 'operational')
      };

      // Calculate summary statistics
      const summary = {
        total: alertRules.length,
        enabled: alertRules.filter(rule => rule.enabled).length,
        disabled: alertRules.filter(rule => !rule.enabled).length,
        byCategory: {
          financial: alertRules.filter(rule => rule.category === 'financial').length,
          business: alertRules.filter(rule => rule.category === 'business').length,
          performance: alertRules.filter(rule => rule.category === 'performance').length,
          operational: alertRules.filter(rule => rule.category === 'operational').length
        },
        bySeverity: {
          low: alertRules.filter(rule => rule.severity === 'low').length,
          medium: alertRules.filter(rule => rule.severity === 'medium').length,
          high: alertRules.filter(rule => rule.severity === 'high').length,
          critical: alertRules.filter(rule => rule.severity === 'critical').length
        }
      };

      return json({
        success: true,
        data: {
          alertRules,
          rulesByCategory,
          summary
        },
        parameters: {
          category,
          severity,
          enabled
        },
        generatedAt: new Date().toISOString()
      });

    } catch (error) {
      return ApiErrorHandler.handleError(error as Error, { request, locals } as any, {
        operation: 'get_kpi_alerts',
        userId: user?.id
      });
    }
  });
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
  return PerformanceMonitor.monitorApiRoute('kpi-alerts', 'POST', async () => {
    let user: any = undefined;
    try {
      // CSRF validation for state-changing operations
      if (!isCsrfRequestValid({ request, url })) {
        return json(
          { error: 'Invalid request origin' },
          { status: 403 }
        );
      }

      // Check authentication - explicitly read session first
      const session = await locals.getSession();
      if (!session) {
        return json({ error: 'Not authenticated' }, { status: 401 });
      }
      
      user = await getSessionUserOrThrow({ request, locals } as any);
      
      // Check if user has admin privileges for KPI access
      if (!user.app_metadata?.role || user.app_metadata.role !== 'admin') {
        return json(
          { error: 'Insufficient permissions to manage KPI alerts' },
          { status: 403 }
        );
      }

      // Parse and validate request body
      const body = await request.json();
      const validation = validate(KPIAlertActionSchema, body);
      
      if (!validation.ok) {
        return json(
          { error: 'Invalid request data', details: validation.error },
          { status: 400 }
        );
      }
      
      const { action, ruleId, ruleData } = validation.value;

      switch (action) {
        case 'create':
          // Create new alert rule
          // ruleData is already validated by Zod schema

          const newRuleId = KPIReportingService.addAlertRule({
            name: ruleData.name,
            metric: ruleData.metric,
            category: ruleData.category,
            threshold: ruleData.threshold,
            operator: ruleData.operator,
            severity: ruleData.severity,
            enabled: ruleData.enabled !== false, // Default to true
            cooldownMinutes: ruleData.cooldownMinutes || 60
          });

          return json({
            success: true,
            data: { ruleId: newRuleId },
            message: 'Alert rule created successfully'
          });

        case 'update':
          // Update existing alert rule
          if (!ruleId) {
            return json(
              { error: 'Rule ID is required' },
              { status: 400 }
            );
          }

          if (!ruleData) {
            return json(
              { error: 'Rule data is required' },
              { status: 400 }
            );
          }

          const updated = KPIReportingService.updateAlertRule(ruleId, ruleData);
          
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

        case 'delete':
          // Delete alert rule
          if (!ruleId) {
            return json(
              { error: 'Rule ID is required' },
              { status: 400 }
            );
          }

          const deleted = KPIReportingService.removeAlertRule(ruleId);
          
          if (!deleted) {
            return json(
              { error: 'Alert rule not found' },
              { status: 404 }
            );
          }

          return json({
            success: true,
            message: 'Alert rule deleted successfully'
          });

        case 'toggle':
          // Toggle alert rule enabled status
          if (!ruleId) {
            return json(
              { error: 'Rule ID is required' },
              { status: 400 }
            );
          }

          const currentRules = KPIReportingService.getAlertRules();
          const rule = currentRules.find(r => r.id === ruleId);
          
          if (!rule) {
            return json(
              { error: 'Alert rule not found' },
              { status: 404 }
            );
          }

          const toggled = KPIReportingService.updateAlertRule(ruleId, { enabled: !rule.enabled });
          
          if (!toggled) {
            return json(
              { error: 'Failed to toggle alert rule' },
              { status: 500 }
            );
          }

          return json({
            success: true,
            data: { enabled: !rule.enabled },
            message: `Alert rule ${!rule.enabled ? 'enabled' : 'disabled'} successfully`
          });

        default:
          return json(
            { error: 'Invalid action. Must be one of: create, update, delete, toggle' },
            { status: 400 }
          );
      }

    } catch (error) {
      return ApiErrorHandler.handleError(error as Error, { request, locals } as any, {
        operation: 'manage_kpi_alerts',
        userId: user?.id
      });
    }
  });
};
