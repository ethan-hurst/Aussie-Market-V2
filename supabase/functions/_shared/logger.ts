/**
 * Structured logging and metrics system for Supabase Edge Functions
 */

export interface LogContext {
  functionName: string;
  requestId?: string;
  userId?: string;
  auctionId?: string;
  orderId?: string;
  listingId?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context: LogContext;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface MetricEntry {
  timestamp: string;
  metric_type: string;
  metric_name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}

export class StructuredLogger {
  private context: LogContext;
  private startTime: number;

  constructor(context: LogContext) {
    this.context = {
      ...context,
      requestId: context.requestId || crypto.randomUUID()
    };
    this.startTime = Date.now();
  }

  private createLogEntry(
    level: LogEntry['level'],
    message: string,
    additionalContext: Record<string, any> = {},
    error?: Error
  ): LogEntry {
    const duration = Date.now() - this.startTime;
    
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...this.context,
        ...additionalContext
      },
      duration,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };
  }

  info(message: string, additionalContext: Record<string, any> = {}) {
    const entry = this.createLogEntry('info', message, additionalContext);
    console.log(JSON.stringify(entry));
  }

  warn(message: string, additionalContext: Record<string, any> = {}) {
    const entry = this.createLogEntry('warn', message, additionalContext);
    console.warn(JSON.stringify(entry));
  }

  error(message: string, error?: Error, additionalContext: Record<string, any> = {}) {
    const entry = this.createLogEntry('error', message, additionalContext, error);
    console.error(JSON.stringify(entry));
  }

  debug(message: string, additionalContext: Record<string, any> = {}) {
    const entry = this.createLogEntry('debug', message, additionalContext);
    console.debug(JSON.stringify(entry));
  }

  // Performance logging
  performance(operation: string, duration: number, additionalContext: Record<string, any> = {}) {
    this.info(`Performance: ${operation}`, {
      ...additionalContext,
      operation,
      duration_ms: duration
    });
  }

  // Business metrics
  metric(name: string, value: number, unit?: string, tags?: Record<string, string>, metadata?: Record<string, any>) {
    const metricEntry: MetricEntry = {
      timestamp: new Date().toISOString(),
      metric_type: 'business',
      metric_name: name,
      value,
      unit,
      tags: {
        function_name: this.context.functionName,
        ...tags
      },
      metadata: {
        request_id: this.context.requestId,
        ...metadata
      }
    };

    console.log(JSON.stringify({
      type: 'metric',
      ...metricEntry
    }));
  }

  // Counter metrics
  counter(name: string, increment: number = 1, tags?: Record<string, string>, metadata?: Record<string, any>) {
    this.metric(name, increment, 'count', tags, metadata);
  }

  // Timer metrics
  timer(name: string, duration: number, tags?: Record<string, string>, metadata?: Record<string, any>) {
    this.metric(name, duration, 'ms', tags, metadata);
  }

  // Create a child logger with additional context
  child(additionalContext: Record<string, any>): StructuredLogger {
    return new StructuredLogger({
      ...this.context,
      ...additionalContext
    });
  }

  // Get the current request ID
  getRequestId(): string {
    return this.context.requestId!;
  }
}

// Utility function to create a logger
export function createLogger(functionName: string, initialContext: Partial<LogContext> = {}): StructuredLogger {
  return new StructuredLogger({
    functionName,
    ...initialContext
  });
}

// Utility function to measure execution time
export async function measureTime<T>(
  logger: StructuredLogger,
  operation: string,
  fn: () => Promise<T>,
  additionalContext: Record<string, any> = {}
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    logger.timer(`${operation}_duration`, duration, {}, additionalContext);
    logger.performance(operation, duration, additionalContext);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.timer(`${operation}_duration`, duration, { status: 'error' }, additionalContext);
    logger.error(`${operation} failed`, error as Error, additionalContext);
    throw error;
  }
}

// Utility function to retry operations with logging
export async function retryWithLogging<T>(
  logger: StructuredLogger,
  operation: string,
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`${operation} attempt ${attempt}/${maxRetries}`);
      const result = await fn();
      
      if (attempt > 1) {
        logger.info(`${operation} succeeded on attempt ${attempt}`, { attempt });
        logger.counter(`${operation}_retry_success`, 1, { attempt: attempt.toString() });
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;
      logger.warn(`${operation} failed on attempt ${attempt}`, { 
        attempt, 
        error: lastError.message 
      });
      logger.counter(`${operation}_retry_attempt`, 1, { attempt: attempt.toString() });
      
      if (attempt < maxRetries) {
        logger.debug(`${operation} retrying in ${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2; // Exponential backoff
      }
    }
  }
  
  logger.error(`${operation} failed after ${maxRetries} attempts`, lastError!);
  logger.counter(`${operation}_retry_failure`, 1, { max_attempts: maxRetries.toString() });
  throw lastError!;
}
