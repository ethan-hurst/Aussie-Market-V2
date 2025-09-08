/**
 * Metrics collection and storage for Supabase Edge Functions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const supabaseUrl = Deno.env.get('PUBLIC_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface MetricData {
  metric_type: string;
  metric_name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
  recorded_at: string;
}

export interface PerformanceMetric {
  operation: string;
  duration_ms: number;
  success: boolean;
  error_message?: string;
  context?: Record<string, any>;
}

export interface BusinessMetric {
  event_type: string;
  entity_type: string;
  entity_id: string;
  value: number;
  metadata?: Record<string, any>;
}

export class MetricsCollector {
  private metrics: MetricData[] = [];
  private batchSize: number = 50;
  private flushInterval: number = 30000; // 30 seconds
  private flushTimer?: number;

  constructor() {
    // Start periodic flush
    this.startPeriodicFlush();
  }

  // Add a metric to the collection
  addMetric(metric: Omit<MetricData, 'recorded_at'>) {
    this.metrics.push({
      ...metric,
      recorded_at: new Date().toISOString()
    });

    // Flush if batch size reached
    if (this.metrics.length >= this.batchSize) {
      this.flush();
    }
  }

  // Add performance metric
  addPerformanceMetric(metric: PerformanceMetric) {
    this.addMetric({
      metric_type: 'performance',
      metric_name: `${metric.operation}_duration`,
      value: metric.duration_ms,
      unit: 'ms',
      tags: {
        operation: metric.operation,
        success: metric.success.toString(),
        ...(metric.error_message && { error: 'true' })
      },
      metadata: {
        ...metric.context,
        ...(metric.error_message && { error_message: metric.error_message })
      }
    });

    // Also add a counter
    this.addMetric({
      metric_type: 'counter',
      metric_name: `${metric.operation}_count`,
      value: 1,
      unit: 'count',
      tags: {
        operation: metric.operation,
        success: metric.success.toString()
      }
    });
  }

  // Add business metric
  addBusinessMetric(metric: BusinessMetric) {
    this.addMetric({
      metric_type: 'business',
      metric_name: `${metric.event_type}_${metric.entity_type}`,
      value: metric.value,
      unit: 'count',
      tags: {
        event_type: metric.event_type,
        entity_type: metric.entity_type
      },
      metadata: {
        entity_id: metric.entity_id,
        ...metric.metadata
      }
    });
  }

  // Flush metrics to database with enhanced error handling
  async flush(): Promise<void> {
    if (this.metrics.length === 0) return;

    const metricsToFlush = [...this.metrics];
    this.metrics = [];

    try {
      // Use structured_metrics table (created by Supabase Specialist)
      const { error } = await supabase
        .from('structured_metrics')
        .insert(metricsToFlush);

      if (error) {
        console.error('Failed to flush metrics:', JSON.stringify({
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          metricsCount: metricsToFlush.length
        }));
        // Re-add metrics to retry later
        this.metrics.unshift(...metricsToFlush);
      } else {
        console.log(JSON.stringify({
          type: 'metrics_flush_success',
          count: metricsToFlush.length,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('Error flushing metrics:', JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        metricsCount: metricsToFlush.length,
        timestamp: new Date().toISOString()
      }));
      // Re-add metrics to retry later
      this.metrics.unshift(...metricsToFlush);
    }
  }

  // Start periodic flush
  private startPeriodicFlush() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  // Stop periodic flush
  stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    // Flush remaining metrics
    this.flush();
  }

  // Get current metrics count
  getMetricsCount(): number {
    return this.metrics.length;
  }
}

// Global metrics collector instance
export const metricsCollector = new MetricsCollector();

// Utility functions for common metrics
export const Metrics = {
  // Auction metrics
  auctionProcessed: (auctionId: string, success: boolean, duration: number) => {
    metricsCollector.addPerformanceMetric({
      operation: 'auction_processed',
      duration_ms: duration,
      success,
      context: { auction_id: auctionId }
    });
  },

  auctionFinalized: (auctionId: string, orderId?: string) => {
    metricsCollector.addBusinessMetric({
      event_type: 'auction_finalized',
      entity_type: 'auction',
      entity_id: auctionId,
      value: 1,
      metadata: { order_id: orderId }
    });
  },

  auctionNoSale: (auctionId: string) => {
    metricsCollector.addBusinessMetric({
      event_type: 'auction_no_sale',
      entity_type: 'auction',
      entity_id: auctionId,
      value: 1
    });
  },

  // Order metrics
  orderCreated: (orderId: string, amountCents: number) => {
    metricsCollector.addBusinessMetric({
      event_type: 'order_created',
      entity_type: 'order',
      entity_id: orderId,
      value: amountCents,
      metadata: { amount_cents: amountCents }
    });
  },

  // Notification metrics
  notificationSent: (userId: string, type: string) => {
    metricsCollector.addBusinessMetric({
      event_type: 'notification_sent',
      entity_type: 'notification',
      entity_id: userId,
      value: 1,
      metadata: { notification_type: type }
    });
  },

  // Error metrics
  errorOccurred: (operation: string, error: Error, context?: Record<string, any>) => {
    metricsCollector.addPerformanceMetric({
      operation: `${operation}_error`,
      duration_ms: 0,
      success: false,
      error_message: error.message,
      context
    });
  },

  // Function execution metrics
  functionExecuted: (functionName: string, duration: number, success: boolean) => {
    metricsCollector.addPerformanceMetric({
      operation: `function_${functionName}`,
      duration_ms: duration,
      success,
      context: { function_name: functionName }
    });
  },

  // Enhanced function metrics with memory usage
  functionExecutedWithMemory: (functionName: string, duration: number, success: boolean, memoryUsage?: any) => {
    metricsCollector.addPerformanceMetric({
      operation: `function_${functionName}`,
      duration_ms: duration,
      success,
      context: { 
        function_name: functionName,
        memory_usage: memoryUsage
      }
    });
  },

  // Webhook processing metrics
  webhookProcessed: (webhookType: string, duration: number, success: boolean, eventId?: string) => {
    metricsCollector.addPerformanceMetric({
      operation: `webhook_${webhookType}`,
      duration_ms: duration,
      success,
      context: { 
        webhook_type: webhookType,
        event_id: eventId
      }
    });
  },

  // Database operation metrics
  databaseOperation: (operation: string, duration: number, success: boolean, tableName?: string) => {
    metricsCollector.addPerformanceMetric({
      operation: `db_${operation}`,
      duration_ms: duration,
      success,
      context: { 
        operation,
        table_name: tableName
      }
    });
  },

  // Error tracking metrics
  errorTracked: (errorType: string, errorCategory: string, context?: Record<string, any>) => {
    metricsCollector.addBusinessMetric({
      event_type: 'error_occurred',
      entity_type: 'error',
      entity_id: `${errorType}_${errorCategory}`,
      value: 1,
      metadata: {
        error_type: errorType,
        error_category: errorCategory,
        ...context
      }
    });
  },

  // Performance threshold alerts
  performanceAlert: (operation: string, duration: number, threshold: number) => {
    metricsCollector.addBusinessMetric({
      event_type: 'performance_alert',
      entity_type: 'operation',
      entity_id: operation,
      value: duration,
      metadata: {
        operation,
        duration_ms: duration,
        threshold_ms: threshold,
        severity: duration > threshold * 2 ? 'critical' : 'warning'
      }
    });
  }
};

// Cleanup function to flush metrics on function exit
export function setupMetricsCleanup() {
  // Flush metrics when the function is about to exit
  const cleanup = () => {
    metricsCollector.stop();
  };

  // Handle different exit scenarios
  if (typeof Deno !== 'undefined') {
    // Deno environment
    Deno.addSignalListener('SIGTERM', cleanup);
    Deno.addSignalListener('SIGINT', cleanup);
  }

  // Also flush on unload
  if (typeof addEventListener !== 'undefined') {
    addEventListener('beforeunload', cleanup);
  }

  return cleanup;
}
