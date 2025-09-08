/**
 * API Performance Monitoring Middleware
 * Automatically tracks API performance metrics and integrates with KPI system
 */

import { recordAPIPerformance, recordSystemError, kpiMetricsCollector } from '$lib/server/kpi-metrics-server';
import { PerformanceMonitor } from '$lib/performance-monitor';

export interface APIPerformanceContext {
  endpoint: string;
  method: string;
  userId?: string;
  startTime: number;
}

export class APIPerformanceMonitor {
  private static performanceData = new Map<string, APIPerformanceContext>();

  /**
   * Start monitoring an API request
   */
  public static startMonitoring(
    endpoint: string,
    method: string,
    userId?: string
  ): string {
    const requestId = `${method}:${endpoint}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const startTime = Date.now();

    this.performanceData.set(requestId, {
      endpoint,
      method,
      userId,
      startTime
    });

    return requestId;
  }

  /**
   * Get performance data (readonly access)
   */
  public static getPerformanceData(): ReadonlyMap<string, APIPerformanceContext> {
    return new Map(this.performanceData);
  }

  /**
   * Get performance statistics
   */
  public static getPerformanceStats(): {
    activeRequests: number;
    averageResponseTime: number;
    errorRate: number;
  } {
    const activeRequests = this.performanceData.size;
    
    // Calculate average response time from completed requests
    // This would need to be implemented with historical data
    const averageResponseTime = 0; // Placeholder
    const errorRate = 0; // Placeholder
    
    return {
      activeRequests,
      averageResponseTime,
      errorRate
    };
  }

  /**
   * End monitoring and record metrics
   */
  public static endMonitoring(
    requestId: string,
    success: boolean = true,
    error?: Error
  ): void {
    const context = this.performanceData.get(requestId);
    if (!context) {
      console.warn(`Performance monitoring context not found for request: ${requestId}`);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - context.startTime;

    // Record API performance metrics
    recordAPIPerformance(context.endpoint, duration);

    // Record system errors if applicable
    if (!success && error) {
      recordSystemError('api_error', 1);
    }

    // Record slow API responses (>2 seconds)
    if (duration > 2000) {
      recordSystemError('slow_api_response', 1);
    }

    // Clean up
    this.performanceData.delete(requestId);
  }

  /**
   * Record API request count
   */
  public static recordRequest(endpoint: string, method: string): void {
    // This could be expanded to track request counts, user activity, etc.
    kpiMetricsCollector.recordOperationalEvent('api_request', 'request_count', 1, 'count', {
      tags: { endpoint, method, event: 'api_request' }
    });
  }

  /**
   * Record API error
   */
  public static recordError(endpoint: string, method: string, error: Error): void {
    // Note: recordSystemError is called by endMonitoring, not here to avoid duplicates
    
    kpiMetricsCollector.recordOperationalEvent('api_error', 'error_count', 1, 'count', {
      tags: { 
        endpoint, 
        method, 
        error_type: error.name,
        event: 'api_error' 
      },
      metadata: {
        error_message: error.message,
        stack: error.stack
      }
    });
  }
}

/**
 * Higher-order function to wrap API handlers with performance monitoring
 */
export function withAPIPerformanceMonitoring<T extends any[]>(
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    // Extract request and locals from the first argument (SvelteKit RequestEvent)
    const event = args[0] as any;
    const endpoint = event.url.pathname;
    const method = event.request.method;
    
    // Start monitoring
    const requestId = APIPerformanceMonitor.startMonitoring(endpoint, method);
    
    try {
      // Record request
      APIPerformanceMonitor.recordRequest(endpoint, method);
      
      // Execute the handler
      const response = await handler(...args);
      
      // End monitoring with success
      APIPerformanceMonitor.endMonitoring(requestId, true);
      
      return response;
    } catch (error) {
      // End monitoring with error
      APIPerformanceMonitor.endMonitoring(requestId, false, error as Error);
      
      // Record the error
      APIPerformanceMonitor.recordError(endpoint, method, error as Error);
      
      // Re-throw the error
      throw error;
    }
  };
}

/**
 * Performance monitoring decorator for class methods
 */
export function monitorAPIMethod(endpoint: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const requestId = APIPerformanceMonitor.startMonitoring(endpoint, 'POST');
      
      try {
        const result = await method.apply(this, args);
        APIPerformanceMonitor.endMonitoring(requestId, true);
        return result;
      } catch (error) {
        APIPerformanceMonitor.endMonitoring(requestId, false, error as Error);
        APIPerformanceMonitor.recordError(endpoint, 'POST', error as Error);
        throw error;
      }
    };
  };
}

/**
 * Utility function to get current performance statistics
 */
export function getPerformanceStats(): {
  activeRequests: number;
  averageResponseTime: number;
  errorRate: number;
} {
  const activeRequests = APIPerformanceMonitor.getPerformanceData().size;
  
  // This would need to be implemented with actual metrics collection
  // For now, return placeholder values
  return {
    activeRequests,
    averageResponseTime: 0, // Would be calculated from historical data
    errorRate: 0 // Would be calculated from historical data
  };
}
