/**
 * KPI Metrics Collection and Business Intelligence System
 * Comprehensive metrics collection for financial, business, performance, and operational KPIs
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '$lib/env';

// Initialize Supabase client
const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export type KPICategory = 'financial' | 'business' | 'performance' | 'operational';
export type TimePeriod = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface KPIMetric {
  id?: string;
  category: KPICategory;
  metric_name: string;
  metric_value: number;
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
  lastUpdated: string;
}

export class KPIMetricsCollector {
  private static instance: KPIMetricsCollector;
  private events: KPIEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  private constructor() {
    // Start periodic flush of events
    this.startPeriodicFlush();
  }

  public static getInstance(): KPIMetricsCollector {
    if (!KPIMetricsCollector.instance) {
      KPIMetricsCollector.instance = new KPIMetricsCollector();
    }
    return KPIMetricsCollector.instance;
  }

  /**
   * Record a KPI event for real-time metrics collection
   */
  public recordEvent(event: Omit<KPIEvent, 'id' | 'recorded_at' | 'created_at'>): void {
    const kpiEvent: KPIEvent = {
      ...event,
      recorded_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    this.events.push(kpiEvent);

    // Flush immediately for critical events
    if (event.category === 'operational' && event.metric_name.includes('error')) {
      this.flushEvents();
    }
  }

  /**
   * Record financial KPI events
   */
  public recordFinancialEvent(
    eventType: string,
    metricName: string,
    value: number,
    unit: string = 'cents',
    context?: {
      userId?: string;
      orderId?: string;
      listingId?: string;
      auctionId?: string;
      tags?: Record<string, any>;
      metadata?: Record<string, any>;
    }
  ): void {
    this.recordEvent({
      event_type: eventType,
      category: 'financial',
      metric_name: metricName,
      metric_value: value,
      metric_unit: unit,
      user_id: context?.userId,
      order_id: context?.orderId,
      listing_id: context?.listingId,
      auction_id: context?.auctionId,
      tags: context?.tags,
      metadata: context?.metadata
    });
  }

  /**
   * Record business KPI events
   */
  public recordBusinessEvent(
    eventType: string,
    metricName: string,
    value: number,
    unit: string = 'count',
    context?: {
      userId?: string;
      orderId?: string;
      listingId?: string;
      auctionId?: string;
      tags?: Record<string, any>;
      metadata?: Record<string, any>;
    }
  ): void {
    this.recordEvent({
      event_type: eventType,
      category: 'business',
      metric_name: metricName,
      metric_value: value,
      metric_unit: unit,
      user_id: context?.userId,
      order_id: context?.orderId,
      listing_id: context?.listingId,
      auction_id: context?.auctionId,
      tags: context?.tags,
      metadata: context?.metadata
    });
  }

  /**
   * Record performance KPI events
   */
  public recordPerformanceEvent(
    eventType: string,
    metricName: string,
    value: number,
    unit: string = 'milliseconds',
    context?: {
      userId?: string;
      orderId?: string;
      listingId?: string;
      auctionId?: string;
      tags?: Record<string, any>;
      metadata?: Record<string, any>;
    }
  ): void {
    this.recordEvent({
      event_type: eventType,
      category: 'performance',
      metric_name: metricName,
      metric_value: value,
      metric_unit: unit,
      user_id: context?.userId,
      order_id: context?.orderId,
      listing_id: context?.listingId,
      auction_id: context?.auctionId,
      tags: context?.tags,
      metadata: context?.metadata
    });
  }

  /**
   * Record operational KPI events
   */
  public recordOperationalEvent(
    eventType: string,
    metricName: string,
    value: number,
    unit: string = 'count',
    context?: {
      userId?: string;
      orderId?: string;
      listingId?: string;
      auctionId?: string;
      tags?: Record<string, any>;
      metadata?: Record<string, any>;
    }
  ): void {
    this.recordEvent({
      event_type: eventType,
      category: 'operational',
      metric_name: metricName,
      metric_value: value,
      metric_unit: unit,
      user_id: context?.userId,
      order_id: context?.orderId,
      listing_id: context?.listingId,
      auction_id: context?.auctionId,
      tags: context?.tags,
      metadata: context?.metadata
    });
  }

  /**
   * Flush events to database
   */
  public async flushEvents(): Promise<void> {
    if (this.events.length === 0) return;

    const eventsToFlush = [...this.events];
    this.events = [];

    try {
      const { error } = await supabase
        .from('kpi_events')
        .insert(eventsToFlush);

      if (error) {
        console.error('Failed to flush KPI events:', error);
        // Re-add events to retry later
        this.events.unshift(...eventsToFlush);
      } else {
        console.log(`Flushed ${eventsToFlush.length} KPI events`);
      }
    } catch (error) {
      console.error('Error flushing KPI events:', error);
      // Re-add events to retry later
      this.events.unshift(...eventsToFlush);
    }
  }

  /**
   * Start periodic flush of events
   */
  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flushEvents();
    }, 30000); // Flush every 30 seconds
  }

  /**
   * Stop periodic flush
   */
  public stopPeriodicFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

/**
 * KPI Metrics Service for dashboard and reporting
 */
export class KPIMetricsService {
  /**
   * Get KPI dashboard data
   */
  public static async getDashboardData(): Promise<KPIDashboardData> {
    try {
      const [financialResult, businessResult, performanceResult, operationalResult] = await Promise.all([
        supabase.from('kpi_dashboard_financial').select('*').order('period_start', { ascending: false }).limit(50),
        supabase.from('kpi_dashboard_business').select('*').order('period_start', { ascending: false }).limit(50),
        supabase.from('kpi_dashboard_performance').select('*').order('period_start', { ascending: false }).limit(50),
        supabase.from('kpi_dashboard_operational').select('*').order('period_start', { ascending: false }).limit(50)
      ]);

      return {
        financial: financialResult.data || [],
        business: businessResult.data || [],
        performance: performanceResult.data || [],
        operational: operationalResult.data || [],
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching KPI dashboard data:', error);
      throw error;
    }
  }

  /**
   * Get KPI metrics by category and time range
   */
  public static async getMetricsByCategory(
    category: KPICategory,
    startDate: string,
    endDate: string,
    timePeriod: TimePeriod = 'daily'
  ): Promise<KPIMetric[]> {
    try {
      const { data, error } = await supabase
        .from('kpi_metrics')
        .select('*')
        .eq('category', category)
        .eq('time_period', timePeriod)
        .gte('period_start', startDate)
        .lte('period_end', endDate)
        .order('period_start', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Error fetching ${category} metrics:`, error);
      throw error;
    }
  }

  /**
   * Get specific metric trends
   */
  public static async getMetricTrends(
    metricName: string,
    category: KPICategory,
    days: number = 30
  ): Promise<KPIMetric[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('kpi_metrics')
        .select('*')
        .eq('category', category)
        .eq('metric_name', metricName)
        .gte('period_start', startDate.toISOString())
        .order('period_start', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Error fetching ${metricName} trends:`, error);
      throw error;
    }
  }

  /**
   * Get real-time KPI events
   */
  public static async getRecentEvents(
    category?: KPICategory,
    limit: number = 100
  ): Promise<KPIEvent[]> {
    try {
      let query = supabase
        .from('kpi_events')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(limit);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching recent KPI events:', error);
      throw error;
    }
  }

  /**
   * Calculate KPIs for a specific time period
   */
  public static async calculateKPIs(
    startTime: string,
    endTime: string,
    timePeriod: TimePeriod
  ): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('calculate_all_kpis', {
        start_time: startTime,
        end_time: endTime,
        time_period: timePeriod
      });

      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error calculating KPIs:', error);
      throw error;
    }
  }

  /**
   * Get KPI summary for a time period
   */
  public static async getKPISummary(
    startDate: string,
    endDate: string,
    timePeriod: TimePeriod = 'daily'
  ): Promise<{
    financial: Record<string, number>;
    business: Record<string, number>;
    performance: Record<string, number>;
    operational: Record<string, number>;
  }> {
    try {
      const [financial, business, performance, operational] = await Promise.all([
        this.getMetricsByCategory('financial', startDate, endDate, timePeriod),
        this.getMetricsByCategory('business', startDate, endDate, timePeriod),
        this.getMetricsByCategory('performance', startDate, endDate, timePeriod),
        this.getMetricsByCategory('operational', startDate, endDate, timePeriod)
      ]);

      const summarize = (metrics: KPIMetric[]) => {
        const summary: Record<string, number> = {};
        metrics.forEach(metric => {
          if (!summary[metric.metric_name]) {
            summary[metric.metric_name] = 0;
          }
          summary[metric.metric_name] += metric.metric_value;
        });
        return summary;
      };

      return {
        financial: summarize(financial),
        business: summarize(business),
        performance: summarize(performance),
        operational: summarize(operational)
      };
    } catch (error) {
      console.error('Error getting KPI summary:', error);
      throw error;
    }
  }
}

// Convenience functions for common KPI recording
export const recordOrderCreated = (orderId: string, amountCents: number, userId: string, listingId: string) => {
  const collector = KPIMetricsCollector.getInstance();
  collector.recordFinancialEvent('order_created', 'order_value_cents', amountCents, 'cents', {
    orderId,
    userId,
    listingId,
    tags: { event: 'order_created' }
  });
};

export const recordPaymentSuccess = (orderId: string, amountCents: number, userId: string) => {
  const collector = KPIMetricsCollector.getInstance();
  collector.recordFinancialEvent('payment_success', 'payment_amount_cents', amountCents, 'cents', {
    orderId,
    userId,
    tags: { event: 'payment_success' }
  });
};

export const recordBidPlaced = (auctionId: string, amountCents: number, userId: string, listingId: string) => {
  const collector = KPIMetricsCollector.getInstance();
  collector.recordBusinessEvent('bid_placed', 'bid_amount_cents', amountCents, 'cents', {
    auctionId,
    userId,
    listingId,
    tags: { event: 'bid_placed' }
  });
};

export const recordListingCreated = (listingId: string, userId: string) => {
  const collector = KPIMetricsCollector.getInstance();
  collector.recordBusinessEvent('listing_created', 'listing_count', 1, 'count', {
    listingId,
    userId,
    tags: { event: 'listing_created' }
  });
};

export const recordAPIPerformance = (endpoint: string, responseTimeMs: number) => {
  const collector = KPIMetricsCollector.getInstance();
  collector.recordPerformanceEvent('api_request', 'api_response_time_ms', responseTimeMs, 'milliseconds', {
    tags: { endpoint, event: 'api_request' }
  });
};

export const recordSystemError = (errorType: string, errorCount: number = 1) => {
  const collector = KPIMetricsCollector.getInstance();
  collector.recordOperationalEvent('system_error', 'error_count', errorCount, 'count', {
    tags: { error_type: errorType, event: 'system_error' }
  });
};

// Export singleton instance
export const kpiMetricsCollector = KPIMetricsCollector.getInstance();
