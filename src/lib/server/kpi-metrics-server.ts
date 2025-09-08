/**
 * Server-only KPI Metrics Collection and Business Intelligence System
 * This module should NEVER be imported by client-side code
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

// Initialize Supabase client with service role key (SERVER-ONLY)
const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

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

/**
 * KPI Metrics Service - Server-only implementation
 */
export class KPIMetricsService {
  private static instance: KPIMetricsService;
  private events: KPIEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.startPeriodicFlush();
    this.setupShutdownHandlers();
  }

  public static getInstance(): KPIMetricsService {
    if (!KPIMetricsService.instance) {
      KPIMetricsService.instance = new KPIMetricsService();
    }
    return KPIMetricsService.instance;
  }

  /**
   * Record a KPI event
   */
  public recordEvent(event: KPIEvent): void {
    event.recorded_at = new Date().toISOString();
    this.events.push(event);

    // Auto-flush if we have too many events
    if (this.events.length >= 100) {
      this.flushEvents();
    }
  }

  /**
   * Record financial metrics
   */
  public recordFinancialEvent(
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
      category: 'financial',
      metric_name: metricName,
      metric_value: value,
      metric_type: 'counter',
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
   * Record business metrics
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
      metric_type: 'counter',
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
   * Record performance metrics
   */
  public recordPerformanceEvent(
    eventType: string,
    metricName: string,
    value: number,
    unit: string = 'ms',
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
      metric_type: 'gauge',
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
   * Record operational metrics
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
      metric_type: 'gauge',
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

    try {
      const eventsToFlush = [...this.events];
      this.events = [];

      const { error } = await supabase
        .from('kpi_events')
        .insert(eventsToFlush);

      if (error) {
        console.error('Error flushing KPI events:', error);
        // Re-add events to queue for retry
        this.events.unshift(...eventsToFlush);
      } else {
        console.log(`✅ Flushed ${eventsToFlush.length} KPI events to database`);
      }
    } catch (error) {
      console.error('Unexpected error flushing KPI events:', error);
    }
  }

  /**
   * Start periodic flush of events
   */
  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(async () => {
      try {
        await this.flushEvents();
      } catch (error) {
        console.error('Error during periodic flush of KPI events:', error);
        // Continue running the interval even if flush fails
      }
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

  /**
   * Setup shutdown handlers for graceful cleanup
   */
  private setupShutdownHandlers(): void {
    const cleanup = () => {
      console.log('Cleaning up KPI metrics service...');
      this.stopPeriodicFlush();
      // Flush any remaining events before shutdown
      this.flushEvents().catch(error => {
        console.error('Error flushing final KPI events during shutdown:', error);
      });
    };

    // Handle various shutdown signals
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
    
    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception in KPI metrics service:', error);
      cleanup();
    });
    
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection in KPI metrics service:', reason);
      cleanup();
    });
  }

  /**
   * Get metrics by category
   */
  public async getMetricsByCategory(
    category: KPICategory,
    startDate: string,
    endDate: string,
    timePeriod: TimePeriod = 'daily'
  ): Promise<KPIMetric[]> {
    const { data, error } = await supabase
      .from('kpi_metrics')
      .select('*')
      .eq('category', category)
      .eq('time_period', timePeriod)
      .gte('period_start', startDate)
      .lte('period_end', endDate)
      .order('period_start', { ascending: true });

    if (error) {
      console.error(`Error fetching ${category} metrics:`, error);
      return [];
    }

    return data || [];
  }

  /**
   * Get dashboard data
   */
  public async getDashboardData(
    startDate: string,
    endDate: string,
    timePeriod: TimePeriod = 'daily'
  ): Promise<KPIDashboardData> {
    const [financial, business, performance, operational] = await Promise.all([
      this.getMetricsByCategory('financial', startDate, endDate, timePeriod),
      this.getMetricsByCategory('business', startDate, endDate, timePeriod),
      this.getMetricsByCategory('performance', startDate, endDate, timePeriod),
      this.getMetricsByCategory('operational', startDate, endDate, timePeriod)
    ]);

    return {
      financial,
      business,
      performance,
      operational
    };
  }

  /**
   * Get metrics summary
   */
  public async getMetricsSummary(
    startDate: string,
    endDate: string,
    timePeriod: TimePeriod = 'daily'
  ): Promise<KPIMetricsSummary> {
    const [financial, business, performance, operational] = await Promise.all([
      this.getMetricsByCategory('financial', startDate, endDate, timePeriod),
      this.getMetricsByCategory('business', startDate, endDate, timePeriod),
      this.getMetricsByCategory('performance', startDate, endDate, timePeriod),
      this.getMetricsByCategory('operational', startDate, endDate, timePeriod)
    ]);

    const summarize = (metrics: KPIMetric[]) => {
      const summary: Record<string, { value: number; count: number; type: string }> = {};
      
      metrics.forEach(metric => {
        const key = metric.metric_name;
        
        if (!summary[key]) {
          summary[key] = { value: 0, count: 0, type: metric.metric_type };
        }
        
        // Handle different metric types appropriately
        switch (metric.metric_type) {
          case 'counter':
          case 'sum':
            // For counters and sums, add the values
            summary[key].value += metric.metric_value;
            summary[key].count += 1;
            break;
            
          case 'gauge':
          case 'rate':
          case 'percentage':
            // For gauges, rates, and percentages, maintain sum and count for averaging
            summary[key].value += metric.metric_value;
            summary[key].count += 1;
            break;
            
          case 'average':
            // For averages, maintain sum and count
            summary[key].value += metric.metric_value;
            summary[key].count += 1;
            break;
            
          default:
            // Default to summing
            summary[key].value += metric.metric_value;
            summary[key].count += 1;
        }
      });
      
      // Convert to final summary format
      const finalSummary: Record<string, number> = {};
      Object.entries(summary).forEach(([key, data]) => {
        if (data.type === 'gauge' || data.type === 'rate' || data.type === 'percentage' || data.type === 'average') {
          // Calculate average for these types
          finalSummary[key] = data.count > 0 ? data.value / data.count : 0;
        } else {
          // Use sum for counters and other types
          finalSummary[key] = data.value;
        }
      });
      
      return finalSummary;
    };

    return {
      financial: summarize(financial),
      business: summarize(business),
      performance: summarize(performance),
      operational: summarize(operational)
    };
  }
}

// Export singleton instance
export const kpiMetricsCollector = KPIMetricsService.getInstance();

// Export convenience functions for server-side usage
export async function recordFinancialEvent(
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
): Promise<void> {
  kpiMetricsCollector.recordFinancialEvent(eventType, metricName, value, unit, context);
}

export async function recordBusinessEvent(
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
): Promise<void> {
  kpiMetricsCollector.recordBusinessEvent(eventType, metricName, value, unit, context);
}

export async function recordPerformanceEvent(
  eventType: string,
  metricName: string,
  value: number,
  unit: string = 'ms',
  context?: {
    userId?: string;
    orderId?: string;
    listingId?: string;
    auctionId?: string;
    tags?: Record<string, any>;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  kpiMetricsCollector.recordPerformanceEvent(eventType, metricName, value, unit, context);
}

export async function recordOperationalEvent(
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
): Promise<void> {
  kpiMetricsCollector.recordOperationalEvent(eventType, metricName, value, unit, context);
}

export async function recordAPIPerformance(
  endpoint: string,
  method: string,
  responseTime: number,
  success: boolean = true
): Promise<void> {
  kpiMetricsCollector.recordPerformanceEvent(
    'api_performance',
    `${method}:${endpoint}`,
    responseTime,
    'ms',
    {
      tags: { endpoint, method, success: success.toString() }
    }
  );
}

export async function recordSystemError(
  errorType: string,
  count: number = 1
): Promise<void> {
  kpiMetricsCollector.recordOperationalEvent(
    'system_error',
    errorType,
    count,
    'count',
    {
      tags: { error_type: errorType }
    }
  );
}
