/**
 * KPI Automated Reporting System
 * Generates automated reports and alerts based on KPI metrics
 */

import { KPIMetricsService } from '$lib/server/kpi-metrics-server';
import { sendAlert } from '$lib/server/sentry-alerts-server';

export interface KPIMetricsData {
  financial: Record<string, number>;
  business: Record<string, number>;
  performance: Record<string, number>;
  operational: Record<string, number>;
}

export interface KPIReport {
  id: string;
  title: string;
  type: 'daily' | 'weekly' | 'monthly' | 'alert';
  generatedAt: string;
  period: {
    start: string;
    end: string;
  };
  summary: {
    financial: Record<string, number>;
    business: Record<string, number>;
    performance: Record<string, number>;
    operational: Record<string, number>;
  };
  trends: {
    financial: Record<string, { current: number; previous: number; change: number; changePercent: number }>;
    business: Record<string, { current: number; previous: number; change: number; changePercent: number }>;
    performance: Record<string, { current: number; previous: number; change: number; changePercent: number }>;
    operational: Record<string, { current: number; previous: number; change: number; changePercent: number }>;
  };
  alerts: Array<{
    type: 'warning' | 'critical' | 'info';
    message: string;
    metric: string;
    value: number;
    threshold: number;
  }>;
  recommendations: string[];
}

export interface KPIAlertRule {
  id: string;
  name: string;
  metric: string;
  category: 'financial' | 'business' | 'performance' | 'operational';
  threshold: number;
  operator: 'greater_than' | 'less_than' | 'equals' | 'not_equals';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  cooldownMinutes: number;
  lastTriggered?: string;
}

export class KPIReportingService {
  private static alertRules: KPIAlertRule[] = [
    // Financial alerts
    {
      id: 'gmv_drop',
      name: 'GMV Drop Alert',
      metric: 'gmv_cents',
      category: 'financial',
      threshold: -20, // 20% drop
      operator: 'less_than',
      severity: 'high',
      enabled: true,
      cooldownMinutes: 60
    },
    {
      id: 'payment_failure_rate',
      name: 'High Payment Failure Rate',
      metric: 'payment_success_rate',
      category: 'financial',
      threshold: 85, // Below 85% success rate
      operator: 'less_than',
      severity: 'critical',
      enabled: true,
      cooldownMinutes: 30
    },
    {
      id: 'refund_rate_high',
      name: 'High Refund Rate',
      metric: 'refund_rate',
      category: 'financial',
      threshold: 10, // Above 10% refund rate
      operator: 'greater_than',
      severity: 'medium',
      enabled: true,
      cooldownMinutes: 120
    },

    // Business alerts
    {
      id: 'attach_rate_low',
      name: 'Low Auction Attach Rate',
      metric: 'auction_attach_rate',
      category: 'business',
      threshold: 15, // Below 15% attach rate
      operator: 'less_than',
      severity: 'medium',
      enabled: true,
      cooldownMinutes: 180
    },
    {
      id: 'bid_participation_low',
      name: 'Low Bid Participation',
      metric: 'bid_participation_rate',
      category: 'business',
      threshold: 20, // Below 20% participation
      operator: 'less_than',
      severity: 'medium',
      enabled: true,
      cooldownMinutes: 240
    },
    {
      id: 'user_engagement_low',
      name: 'Low User Engagement',
      metric: 'user_engagement_rate',
      category: 'business',
      threshold: 30, // Below 30% engagement
      operator: 'less_than',
      severity: 'high',
      enabled: true,
      cooldownMinutes: 120
    },

    // Performance alerts
    {
      id: 'api_slow',
      name: 'Slow API Response',
      metric: 'avg_api_response_time_ms',
      category: 'performance',
      threshold: 1000, // Above 1 second
      operator: 'greater_than',
      severity: 'high',
      enabled: true,
      cooldownMinutes: 60
    },
    {
      id: 'bid_latency_high',
      name: 'High Bid Latency',
      metric: 'avg_bid_latency_ms',
      category: 'performance',
      threshold: 500, // Above 500ms
      operator: 'greater_than',
      severity: 'medium',
      enabled: true,
      cooldownMinutes: 90
    },
    {
      id: 'error_rate_high',
      name: 'High API Error Rate',
      metric: 'api_error_rate',
      category: 'performance',
      threshold: 5, // Above 5% error rate
      operator: 'greater_than',
      severity: 'critical',
      enabled: true,
      cooldownMinutes: 15
    },

    // Operational alerts
    {
      id: 'uptime_low',
      name: 'Low System Uptime',
      metric: 'system_uptime_percentage',
      category: 'operational',
      threshold: 99, // Below 99% uptime
      operator: 'less_than',
      severity: 'critical',
      enabled: true,
      cooldownMinutes: 30
    },
    {
      id: 'memory_high',
      name: 'High Memory Usage',
      metric: 'avg_memory_usage_mb',
      category: 'operational',
      threshold: 500, // Above 500MB
      operator: 'greater_than',
      severity: 'medium',
      enabled: true,
      cooldownMinutes: 60
    }
  ];

  /**
   * Generate a comprehensive KPI report
   */
  public static async generateReport(
    type: 'daily' | 'weekly' | 'monthly',
    customPeriod?: { start: string; end: string }
  ): Promise<KPIReport> {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    if (customPeriod) {
      start = new Date(customPeriod.start);
      end = new Date(customPeriod.end);
    } else {
      switch (type) {
        case 'daily':
          start = new Date(now);
          start.setDate(start.getDate() - 1);
          break;
        case 'weekly':
          start = new Date(now);
          start.setDate(start.getDate() - 7);
          break;
        case 'monthly':
          start = new Date(now);
          start.setMonth(start.getMonth() - 1);
          break;
      }
    }

    // Get current period metrics
    const currentMetrics = await KPIMetricsService.getKPISummary(
      start.toISOString(),
      end.toISOString(),
      type === 'daily' ? 'hourly' : 'daily'
    );

    // Get previous period metrics for comparison
    const previousStart = new Date(start);
    const previousEnd = new Date(start);
    const periodLength = end.getTime() - start.getTime();
    previousStart.setTime(previousStart.getTime() - periodLength);
    previousEnd.setTime(previousEnd.getTime() - periodLength);

    const previousMetrics = await KPIMetricsService.getKPISummary(
      previousStart.toISOString(),
      previousEnd.toISOString(),
      type === 'daily' ? 'hourly' : 'daily'
    );

    // Calculate trends
    const trends = this.calculateTrends(currentMetrics, previousMetrics);

    // Check for alerts
    const alerts = await this.checkAlerts(currentMetrics);

    // Generate recommendations
    const recommendations = this.generateRecommendations(currentMetrics, trends, alerts);

    return {
      id: `kpi-report-${type}-${Date.now()}`,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} KPI Report`,
      type,
      generatedAt: new Date().toISOString(),
      period: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      summary: currentMetrics,
      trends,
      alerts,
      recommendations
    };
  }

  /**
   * Calculate trends between current and previous periods
   */
  private static calculateTrends(
    current: KPIMetricsData,
    previous: KPIMetricsData
  ): KPIReport['trends'] {
    const calculateTrend = (currentValue: number, previousValue: number) => {
      const change = currentValue - previousValue;
      const changePercent = previousValue !== 0 ? (change / previousValue) * 100 : 0;
      return { current: currentValue, previous: previousValue, change, changePercent };
    };

    const processCategory = (currentCat: Record<string, number>, previousCat: Record<string, number>) => {
      const trends: Record<string, any> = {};
      Object.keys(currentCat).forEach(metric => {
        trends[metric] = calculateTrend(currentCat[metric] || 0, previousCat[metric] || 0);
      });
      return trends;
    };

    return {
      financial: processCategory(current.financial, previous.financial),
      business: processCategory(current.business, previous.business),
      performance: processCategory(current.performance, previous.performance),
      operational: processCategory(current.operational, previous.operational)
    };
  }

  /**
   * Check for alert conditions
   */
  private static async checkAlerts(metrics: KPIMetricsData): Promise<KPIReport['alerts']> {
    const alerts: KPIReport['alerts'] = [];

    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      // Check cooldown
      if (rule.lastTriggered) {
        const lastTriggered = new Date(rule.lastTriggered);
        const cooldownEnd = new Date(lastTriggered.getTime() + rule.cooldownMinutes * 60 * 1000);
        if (new Date() < cooldownEnd) continue;
      }

      const currentValue = metrics[rule.category]?.[rule.metric] || 0;
      let shouldAlert = false;

      switch (rule.operator) {
        case 'greater_than':
          shouldAlert = currentValue > rule.threshold;
          break;
        case 'less_than':
          shouldAlert = currentValue < rule.threshold;
          break;
        case 'equals':
          shouldAlert = currentValue === rule.threshold;
          break;
        case 'not_equals':
          shouldAlert = currentValue !== rule.threshold;
          break;
      }

      if (shouldAlert) {
        alerts.push({
          type: rule.severity === 'critical' ? 'critical' : rule.severity === 'high' ? 'warning' : 'info',
          message: `${rule.name}: ${rule.metric} is ${currentValue} (threshold: ${rule.threshold})`,
          metric: rule.metric,
          value: currentValue,
          threshold: rule.threshold
        });

        // Send alert via server-only alerting system
        try {
          await sendAlert({
            id: `kpi-${rule.id}-${Date.now()}`,
            type: 'custom',
            severity: rule.severity,
            title: rule.name,
            message: `${rule.metric} is ${currentValue} (threshold: ${rule.threshold})`,
            source: {
              functionName: 'kpi-reporting',
              correlationId: `kpi-${rule.id}`
            },
            metadata: {
              metric: rule.metric,
              value: currentValue,
              threshold: rule.threshold,
              category: rule.category
            },
            triggeredAt: new Date().toISOString(),
            status: 'active'
          });

          // Only update last triggered time after successful alert
          rule.lastTriggered = new Date().toISOString();
        } catch (error) {
          console.error(`Failed to send KPI alert for rule ${rule.id}:`, error);
          // Do not update lastTriggered to allow retry on next check
        }
      }
    }

    return alerts;
  }

  /**
   * Generate recommendations based on metrics and trends
   */
  private static generateRecommendations(
    metrics: any,
    trends: KPIReport['trends'],
    alerts: KPIReport['alerts']
  ): string[] {
    const recommendations: string[] = [];

    // Financial recommendations
    if (trends.financial.gmv_cents?.changePercent < -10) {
      recommendations.push('GMV is declining. Consider promotional campaigns or improved listing quality.');
    }
    if (metrics.financial.payment_success_rate < 90) {
      recommendations.push('Payment success rate is low. Review payment processing and user experience.');
    }
    if (metrics.financial.refund_rate > 5) {
      recommendations.push('Refund rate is high. Investigate product quality and seller performance.');
    }

    // Business recommendations
    if (metrics.business.auction_attach_rate < 20) {
      recommendations.push('Low auction attach rate. Consider improving listing quality and marketing.');
    }
    if (metrics.business.bid_participation_rate < 30) {
      recommendations.push('Low bid participation. Consider reducing bid increments or improving user engagement.');
    }
    if (metrics.business.user_engagement_rate < 40) {
      recommendations.push('Low user engagement. Consider implementing gamification or improved notifications.');
    }

    // Performance recommendations
    if (metrics.performance.avg_api_response_time_ms > 500) {
      recommendations.push('API response times are slow. Consider database optimization or caching.');
    }
    if (metrics.performance.avg_bid_latency_ms > 300) {
      recommendations.push('Bid latency is high. Consider optimizing real-time systems.');
    }
    if (metrics.performance.api_error_rate > 2) {
      recommendations.push('API error rate is elevated. Review error handling and system stability.');
    }

    // Operational recommendations
    if (metrics.operational.system_uptime_percentage < 99.5) {
      recommendations.push('System uptime is below target. Review infrastructure and monitoring.');
    }
    if (metrics.operational.avg_memory_usage_mb > 400) {
      recommendations.push('Memory usage is high. Consider memory optimization or scaling.');
    }

    return recommendations;
  }

  /**
   * Get all alert rules
   */
  public static getAlertRules(): KPIAlertRule[] {
    return this.alertRules;
  }

  /**
   * Update alert rule
   */
  public static updateAlertRule(ruleId: string, updates: Partial<KPIAlertRule>): boolean {
    const ruleIndex = this.alertRules.findIndex(rule => rule.id === ruleId);
    if (ruleIndex === -1) return false;

    this.alertRules[ruleIndex] = { ...this.alertRules[ruleIndex], ...updates };
    return true;
  }

  /**
   * Add new alert rule
   */
  public static addAlertRule(rule: Omit<KPIAlertRule, 'id'>): string {
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.alertRules.push({ ...rule, id });
    return id;
  }

  /**
   * Remove alert rule
   */
  public static removeAlertRule(ruleId: string): boolean {
    const ruleIndex = this.alertRules.findIndex(rule => rule.id === ruleId);
    if (ruleIndex === -1) return false;

    this.alertRules.splice(ruleIndex, 1);
    return true;
  }
}
