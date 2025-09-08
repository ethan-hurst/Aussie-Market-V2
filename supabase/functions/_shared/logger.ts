/**
 * Enhanced structured logging and metrics system for Supabase Edge Functions
 * Includes correlation ID tracking, request/response logging, and performance monitoring
 */

export interface LogContext {
  functionName: string;
  requestId?: string;
  correlationId?: string;
  userId?: string;
  auctionId?: string;
  orderId?: string;
  listingId?: string;
  httpMethod?: string;
  userAgent?: string;
  ipAddress?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context: LogContext;
  duration?: number;
  memoryUsage?: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    cause?: any;
  };
  request?: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    body?: any;
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
  private requestStartTime: number;
  private memoryStart: any;

  constructor(context: LogContext) {
    this.context = {
      ...context,
      requestId: context.requestId || crypto.randomUUID(),
      correlationId: context.correlationId || crypto.randomUUID()
    };
    this.startTime = Date.now();
    this.requestStartTime = Date.now();
    
    // Capture initial memory usage if available
    if (typeof performance !== 'undefined' && performance.memory) {
      this.memoryStart = {
        rss: performance.memory.usedJSHeapSize,
        heapUsed: performance.memory.usedJSHeapSize,
        heapTotal: performance.memory.totalJSHeapSize,
        external: performance.memory.jsHeapSizeLimit
      };
    }
  }

  private createLogEntry(
    level: LogEntry['level'],
    message: string,
    additionalContext: Record<string, any> = {},
    error?: Error,
    request?: LogEntry['request'],
    response?: LogEntry['response']
  ): LogEntry {
    const duration = Date.now() - this.startTime;
    const requestDuration = Date.now() - this.requestStartTime;
    
    // Capture current memory usage if available
    let memoryUsage: LogEntry['memoryUsage'];
    if (typeof performance !== 'undefined' && performance.memory) {
      memoryUsage = {
        rss: performance.memory.usedJSHeapSize,
        heapUsed: performance.memory.usedJSHeapSize,
        heapTotal: performance.memory.totalJSHeapSize,
        external: performance.memory.jsHeapSizeLimit
      };
    }
    
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...this.context,
        ...additionalContext,
        requestDuration
      },
      duration,
      memoryUsage,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
        cause: (error as any).cause
      } : undefined,
      request,
      response
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

  // Get the current correlation ID
  getCorrelationId(): string {
    return this.context.correlationId!;
  }

  // Log incoming request
  logRequest(req: Request, additionalContext: Record<string, any> = {}) {
    const requestData: LogEntry['request'] = {
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries()),
      body: undefined // Don't log body by default for security
    };

    // Extract IP address and user agent
    const ipAddress = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    this.context.ipAddress = ipAddress;
    this.context.userAgent = userAgent;
    this.context.httpMethod = req.method;

    const entry = this.createLogEntry('info', 'Request received', {
      ...additionalContext,
      ipAddress,
      userAgent
    }, undefined, requestData);
    
    console.log(JSON.stringify(entry));
  }

  // Log outgoing response
  logResponse(status: number, headers: Record<string, string> = {}, body?: any, additionalContext: Record<string, any> = {}) {
    const responseData: LogEntry['response'] = {
      status,
      headers,
      body: body ? (typeof body === 'string' ? body.substring(0, 1000) : body) : undefined // Truncate large bodies
    };

    const entry = this.createLogEntry('info', 'Response sent', {
      ...additionalContext,
      status
    }, undefined, undefined, responseData);
    
    console.log(JSON.stringify(entry));
  }

  // Enhanced error logging with categorization
  logError(message: string, error: Error, additionalContext: Record<string, any> = {}) {
    // Categorize error types
    let errorCategory = 'unknown';
    if (error.name === 'TypeError') errorCategory = 'type_error';
    else if (error.name === 'ReferenceError') errorCategory = 'reference_error';
    else if (error.name === 'SyntaxError') errorCategory = 'syntax_error';
    else if (error.message.includes('timeout')) errorCategory = 'timeout';
    else if (error.message.includes('network')) errorCategory = 'network';
    else if (error.message.includes('database')) errorCategory = 'database';
    else if (error.message.includes('auth')) errorCategory = 'authentication';
    else if (error.message.includes('permission')) errorCategory = 'authorization';

    const entry = this.createLogEntry('error', message, {
      ...additionalContext,
      errorCategory,
      errorType: error.name
    }, error);
    
    console.error(JSON.stringify(entry));
  }

  // Performance monitoring
  logPerformance(operation: string, duration: number, additionalContext: Record<string, any> = {}) {
    const entry = this.createLogEntry('info', `Performance: ${operation}`, {
      ...additionalContext,
      operation,
      duration_ms: duration,
      performance_category: duration > 5000 ? 'slow' : duration > 1000 ? 'medium' : 'fast'
    });
    
    console.log(JSON.stringify(entry));
  }

  // Memory usage monitoring
  logMemoryUsage(operation: string, additionalContext: Record<string, any> = {}) {
    if (typeof performance !== 'undefined' && performance.memory) {
      const current = {
        rss: performance.memory.usedJSHeapSize,
        heapUsed: performance.memory.usedJSHeapSize,
        heapTotal: performance.memory.totalJSHeapSize,
        external: performance.memory.jsHeapSizeLimit
      };

      const entry = this.createLogEntry('debug', `Memory usage: ${operation}`, {
        ...additionalContext,
        operation,
        memoryUsage: current,
        memoryDelta: this.memoryStart ? {
          rss: current.rss - this.memoryStart.rss,
          heapUsed: current.heapUsed - this.memoryStart.heapUsed
        } : undefined
      });
      
      console.log(JSON.stringify(entry));
    }
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
  
  logger.logError(`${operation} failed after ${maxRetries} attempts`, lastError!);
  logger.counter(`${operation}_retry_failure`, 1, { max_attempts: maxRetries.toString() });
  throw lastError!;
}

// Enhanced function wrapper with comprehensive logging
export async function withEnhancedLogging<T>(
  functionName: string,
  req: Request,
  fn: (logger: StructuredLogger) => Promise<T>
): Promise<Response> {
  const logger = createLogger(functionName, {
    correlationId: req.headers.get('x-correlation-id') || crypto.randomUUID()
  });

  try {
    // Log incoming request
    logger.logRequest(req);
    logger.logMemoryUsage('function_start');

    // Execute the function
    const startTime = Date.now();
    const result = await fn(logger);
    const duration = Date.now() - startTime;

    // Log performance
    logger.logPerformance('function_execution', duration);
    logger.logMemoryUsage('function_end');

    // Create response
    const response = new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': logger.getRequestId(),
        'X-Correlation-ID': logger.getCorrelationId()
      },
      status: 200
    });

    // Log response
    logger.logResponse(200, Object.fromEntries(response.headers.entries()), result);

    return response;

  } catch (error) {
    const duration = Date.now() - logger['startTime'];
    logger.logError('Function execution failed', error as Error, { duration });
    logger.logMemoryUsage('function_error');

    const errorResponse = new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: logger.getRequestId(),
      correlationId: logger.getCorrelationId(),
      timestamp: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': logger.getRequestId(),
        'X-Correlation-ID': logger.getCorrelationId()
      },
      status: 500
    });

    logger.logResponse(500, Object.fromEntries(errorResponse.headers.entries()), {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return errorResponse;
  }
}

// Utility function for database operations with enhanced logging
export async function withDatabaseLogging<T>(
  logger: StructuredLogger,
  operation: string,
  fn: () => Promise<T>,
  additionalContext: Record<string, any> = {}
): Promise<T> {
  const startTime = Date.now();
  try {
    logger.debug(`Starting database operation: ${operation}`, additionalContext);
    const result = await fn();
    const duration = Date.now() - startTime;
    
    logger.logPerformance(`db_${operation}`, duration, additionalContext);
    logger.info(`Database operation completed: ${operation}`, {
      ...additionalContext,
      duration_ms: duration
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.logError(`Database operation failed: ${operation}`, error as Error, {
      ...additionalContext,
      duration_ms: duration
    });
    throw error;
  }
}
