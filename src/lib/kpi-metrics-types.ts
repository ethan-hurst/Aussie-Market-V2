/**
 * KPI Metrics Types - Safe for client-side usage
 * This file contains only type definitions and no server secrets
 */

export type KPICategory = 'financial' | 'business' | 'performance' | 'operational';
export type TimePeriod = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface KPIMetric {
  id?: string;
  category: KPICategory;
  metric_name: string;
  metric_value: number;
  metric_type: 'counter' | 'gauge' | 'rate' | 'percentage' | 'sum' | 'average';
  metric_unit?: string;
  time_period: TimePeriod;
  period_start: string;
  period_end: string;
  tags?: Record<string, any>;
  metadata?: Record<string, any>;
  calculated_at?: string;
  created_at?: string;
}

export interface KPIEvent {
  id?: string;
  event_type: string;
  category: KPICategory;
  metric_name: string;
  metric_value: number;
  metric_type: 'counter' | 'gauge' | 'rate' | 'percentage' | 'sum' | 'average';
  metric_unit?: string;
  user_id?: string;
  order_id?: string;
  listing_id?: string;
  auction_id?: string;
  tags?: Record<string, any>;
  metadata?: Record<string, any>;
  recorded_at?: string;
  created_at?: string;
}

export interface KPIDashboardData {
  financial: KPIMetric[];
  business: KPIMetric[];
  performance: KPIMetric[];
  operational: KPIMetric[];
}

export interface KPIMetricsSummary {
  financial: Record<string, number>;
  business: Record<string, number>;
  performance: Record<string, number>;
  operational: Record<string, number>;
}

export interface KPITrends {
  financial: Record<string, { current: number; previous: number; change: number; changePercent: number }>;
  business: Record<string, { current: number; previous: number; change: number; changePercent: number }>;
  performance: Record<string, { current: number; previous: number; change: number; changePercent: number }>;
  operational: Record<string, { current: number; previous: number; change: number; changePercent: number }>;
}
