/**
 * Performance monitoring utilities with Sentry integration
 * Tracks performance metrics and sends to Sentry for analysis
 */

import { startTransaction, getCurrentHub } from '@sentry/sveltekit';
import type { Transaction } from '@sentry/types';

export interface PerformanceMetrics {
  operation: string;
  duration: number;
  memoryUsage?: NodeJS.MemoryUsage;
  metadata?: Record<string, any>;
}

export class PerformanceMonitor {
  private static transactions = new Map<string, Transaction>();

  /**
   * Start performance monitoring for an operation
   */
  static startOperation(operation: string, metadata?: Record<string, any>): string {
    const transactionId = `${operation}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const transaction = startTransaction({
      name: operation,
      op: 'api.operation',
      tags: {
        operation,
        ...metadata
      },
      data: {
        startTime: Date.now(),
        metadata
      }
    });

    this.transactions.set(transactionId, transaction);
    return transactionId;
  }

  /**
   * End performance monitoring and record metrics
   */
  static endOperation(
    transactionId: string,
    metadata?: Record<string, any>,
    error?: Error
  ): PerformanceMetrics | null {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      console.warn(`PerformanceMonitor: Transaction ${transactionId} not found`);
      return null;
    }

    const duration = Date.now() - (transaction.data?.startTime || Date.now());
    const memoryUsage = process.memoryUsage();

    // Update transaction with final data
    transaction.setData('duration', duration);
    transaction.setData('memoryUsage', memoryUsage);
    transaction.setData('endTime', Date.now());
    
    if (metadata) {
      transaction.setData('finalMetadata', metadata);
    }

    if (error) {
      transaction.setStatus('internal_error');
      transaction.setData('error', {
        message: error.message,
        stack: error.stack
      });
    } else {
      transaction.setStatus('ok');
    }

    // Finish the transaction
    transaction.finish();
    this.transactions.delete(transactionId);

    const metrics: PerformanceMetrics = {
      operation: transaction.name || 'unknown',
      duration,
      memoryUsage,
      metadata
    };

    // Log performance metrics
    this.logPerformanceMetrics(metrics);

    return metrics;
  }

  /**
   * Monitor database operations
   */
  static async monitorDatabaseOperation<T>(
    operation: string,
    query: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const transactionId = this.startOperation(`db.${operation}`, {
      query: query.substring(0, 100), // Truncate long queries
      operation
    });

    try {
      const result = await fn();
      this.endOperation(transactionId, { success: true });
      return result;
    } catch (error) {
      this.endOperation(transactionId, { success: false }, error as Error);
      throw error;
    }
  }

  /**
   * Monitor API route execution
   */
  static async monitorApiRoute<T>(
    route: string,
    method: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const transactionId = this.startOperation(`api.${method.toLowerCase()}.${route}`, {
      route,
      method
    });

    try {
      const result = await fn();
      this.endOperation(transactionId, { success: true });
      return result;
    } catch (error) {
      this.endOperation(transactionId, { success: false }, error as Error);
      throw error;
    }
  }

  /**
   * Monitor Stripe operations
   */
  static async monitorStripeOperation<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const transactionId = this.startOperation(`stripe.${operation}`, {
      operation
    });

    try {
      const result = await fn();
      this.endOperation(transactionId, { success: true });
      return result;
    } catch (error) {
      this.endOperation(transactionId, { success: false }, error as Error);
      throw error;
    }
  }

  /**
   * Monitor file operations
   */
  static async monitorFileOperation<T>(
    operation: string,
    filePath: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const transactionId = this.startOperation(`file.${operation}`, {
      filePath,
      operation
    });

    try {
      const result = await fn();
      this.endOperation(transactionId, { success: true });
      return result;
    } catch (error) {
      this.endOperation(transactionId, { success: false }, error as Error);
      throw error;
    }
  }

  /**
   * Log performance metrics
   */
  private static logPerformanceMetrics(metrics: PerformanceMetrics): void {
    const { operation, duration, memoryUsage } = metrics;
    
    // Log slow operations
    if (duration > 1000) { // 1 second
      console.warn('Slow operation detected:', {
        operation,
        duration: `${duration}ms`,
        memoryUsage: memoryUsage ? {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
        } : undefined
      });
    }

    // Log memory usage warnings
    if (memoryUsage && memoryUsage.heapUsed > 100 * 1024 * 1024) { // 100MB
      console.warn('High memory usage detected:', {
        operation,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
      });
    }
  }

  /**
   * Get current memory usage
   */
  static getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  /**
   * Check if memory usage is high
   */
  static isMemoryUsageHigh(threshold: number = 100 * 1024 * 1024): boolean {
    const memoryUsage = this.getMemoryUsage();
    return memoryUsage.heapUsed > threshold;
  }

  /**
   * Force garbage collection if available (private method)
   */
  private static forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
      console.log('Garbage collection forced');
    }
  }

  /**
   * Controlled garbage collection with safeguards
   */
  private static lastGcTime = 0;
  private static readonly GC_COOLDOWN_MS = 30000; // 30 seconds cooldown

  static requestGarbageCollection(): boolean {
    const now = Date.now();
    
    // Rate limiting: only allow GC every 30 seconds
    if (now - this.lastGcTime < this.GC_COOLDOWN_MS) {
      console.log('Garbage collection request ignored due to cooldown');
      return false;
    }

    // Validate that global.gc exists
    if (!global.gc) {
      console.log('Garbage collection not available (Node.js not started with --expose-gc)');
      return false;
    }

    // Perform controlled garbage collection
    this.forceGarbageCollection();
    this.lastGcTime = now;
    return true;
  }
}

// Decorator for automatic performance monitoring
export function monitorPerformance(operation: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const transactionId = PerformanceMonitor.startOperation(operation, {
        method: propertyName,
        class: target.constructor.name
      });

      try {
        const result = await method.apply(this, args);
        PerformanceMonitor.endOperation(transactionId, { success: true });
        return result;
      } catch (error) {
        PerformanceMonitor.endOperation(transactionId, { success: false }, error as Error);
        throw error;
      }
    };
  };
}

// Utility function for monitoring async operations
export async function withPerformanceMonitoring<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const transactionId = PerformanceMonitor.startOperation(operation, metadata);

  try {
    const result = await fn();
    PerformanceMonitor.endOperation(transactionId, { success: true });
    return result;
  } catch (error) {
    PerformanceMonitor.endOperation(transactionId, { success: false }, error as Error);
    throw error;
  }
}
