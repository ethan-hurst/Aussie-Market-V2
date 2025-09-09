/**
 * Safe data access utilities for dashboard components
 * Prevents runtime errors from null/undefined data
 */

import type { KPIDashboardData, KPIMetric } from '$lib/kpi-metrics-types';

export interface SafeDashboardData {
  financial: KPIMetric[];
  business: KPIMetric[];
  performance: KPIMetric[];
  operational: KPIMetric[];
  isEmpty: boolean;
}

/**
 * Safely access dashboard data with fallbacks
 */
export function safeDashboardData(data?: KPIDashboardData | null): SafeDashboardData {
  if (!data) {
    return {
      financial: [],
      business: [],
      performance: [],
      operational: [],
      isEmpty: true
    };
  }

  return {
    financial: Array.isArray(data.financial) ? data.financial : [],
    business: Array.isArray(data.business) ? data.business : [],
    performance: Array.isArray(data.performance) ? data.performance : [],
    operational: Array.isArray(data.operational) ? data.operational : [],
    isEmpty: false
  };
}

/**
 * Safely get metrics by name with fallback
 */
export function safeMetricsByName(
  metrics: KPIMetric[], 
  metricName: string, 
  fallback: number = 0
): KPIMetric[] {
  if (!Array.isArray(metrics)) {
    return [];
  }
  
  const filtered = metrics.filter(m => m?.metric_name === metricName);
  return filtered.length > 0 ? filtered : [];
}

/**
 * Safely calculate metric sum with fallback
 */
export function safeMetricSum(
  metrics: KPIMetric[], 
  metricName: string, 
  fallback: number = 0
): number {
  try {
    if (!Array.isArray(metrics)) return fallback;
    
    return metrics
      .filter(m => m?.metric_name === metricName && typeof m.metric_value === 'number')
      .reduce((sum, m) => sum + (m.metric_value || 0), 0);
  } catch (error) {
    console.warn(`Error calculating metric sum for ${metricName}:`, error);
    return fallback;
  }
}

/**
 * Safely get latest metric value with fallback
 */
export function safeMetricLatest(
  metrics: KPIMetric[], 
  metricName: string, 
  fallback: number = 0
): number {
  try {
    if (!Array.isArray(metrics)) return fallback;
    
    const filtered = metrics.filter(m => 
      m?.metric_name === metricName && 
      typeof m.metric_value === 'number'
    );
    
    if (filtered.length === 0) return fallback;
    
    // Get the most recent metric (assume sorted by period_start)
    const latest = filtered[filtered.length - 1];
    return latest?.metric_value ?? fallback;
  } catch (error) {
    console.warn(`Error getting latest metric for ${metricName}:`, error);
    return fallback;
  }
}

/**
 * Safely format currency with error handling
 */
export function safeCurrencyFormat(
  value: number, 
  currency: string = 'AUD',
  fallback: string = '$0'
): string {
  try {
    if (typeof value !== 'number' || isNaN(value)) {
      return fallback;
    }
    
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  } catch (error) {
    console.warn('Error formatting currency:', error);
    return fallback;
  }
}

/**
 * Safely format number with error handling
 */
export function safeNumberFormat(
  value: number, 
  fallback: string = '0'
): string {
  try {
    if (typeof value !== 'number' || isNaN(value)) {
      return fallback;
    }
    
    return new Intl.NumberFormat('en-AU').format(value);
  } catch (error) {
    console.warn('Error formatting number:', error);
    return fallback;
  }
}

/**
 * Safely format percentage with error handling
 */
export function safePercentFormat(
  value: number, 
  decimals: number = 1,
  fallback: string = '0%'
): string {
  try {
    if (typeof value !== 'number' || isNaN(value)) {
      return fallback;
    }
    
    return `${value.toFixed(decimals)}%`;
  } catch (error) {
    console.warn('Error formatting percentage:', error);
    return fallback;
  }
}

/**
 * Check if dashboard data is empty or invalid
 */
export function isDashboardDataEmpty(data?: KPIDashboardData | null): boolean {
  if (!data) return true;
  
  const { financial, business, performance, operational } = safeDashboardData(data);
  return financial.length === 0 && 
         business.length === 0 && 
         performance.length === 0 && 
         operational.length === 0;
}

/**
 * Get health status color based on value and thresholds
 */
export function getHealthColor(
  value: number, 
  goodThreshold: number, 
  okThreshold: number
): 'green' | 'yellow' | 'red' {
  if (value >= goodThreshold) return 'green';
  if (value >= okThreshold) return 'yellow';
  return 'red';
}

/**
 * Safely parse date with fallback
 */
export function safeDateParse(dateString?: string | null): Date {
  if (!dateString) return new Date();
  
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? new Date() : date;
  } catch (error) {
    console.warn('Error parsing date:', error);
    return new Date();
  }
}