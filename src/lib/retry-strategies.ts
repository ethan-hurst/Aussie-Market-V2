/**
 * Retry strategies and error classification for auction finalization
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs?: number;
}

export interface RetryableError {
  isRetryable: boolean;
  reason?: string;
  suggestedDelayMs?: number;
}

export class RetryStrategies {
  // Default retry configurations for different operation types
  static readonly CONFIGS = {
    // Database operations - quick retries for transient issues
    database: {
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 2000,
      backoffMultiplier: 2,
      jitterMs: 50
    },
    
    // External API calls - more conservative retries
    external_api: {
      maxRetries: 5,
      baseDelayMs: 500,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      jitterMs: 100
    },
    
    // Critical operations - aggressive retries
    critical: {
      maxRetries: 7,
      baseDelayMs: 200,
      maxDelayMs: 5000,
      backoffMultiplier: 1.5,
      jitterMs: 100
    },
    
    // Notification operations - moderate retries
    notification: {
      maxRetries: 4,
      baseDelayMs: 300,
      maxDelayMs: 3000,
      backoffMultiplier: 2,
      jitterMs: 50
    }
  };

  /**
   * Classify whether an error is retryable
   */
  static classifyError(error: any): RetryableError {
    if (!error) {
      return { isRetryable: false, reason: 'No error provided' };
    }

    const errorMessage = error.message || error.toString();
    const errorCode = error.code || error.status;

    // Database connection errors
    if (errorMessage.includes('connection') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ENOTFOUND')) {
      return { 
        isRetryable: true, 
        reason: 'Database connection issue',
        suggestedDelayMs: 1000
      };
    }

    // Supabase specific errors
    if (errorCode === 'PGRST301' || // Row Level Security violation
        errorCode === 'PGRST116' || // JWT expired
        errorMessage.includes('JWT')) {
      return { 
        isRetryable: true, 
        reason: 'Authentication/authorization issue',
        suggestedDelayMs: 500
      };
    }

    // Rate limiting
    if (errorCode === 429 || 
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests')) {
      return { 
        isRetryable: true, 
        reason: 'Rate limited',
        suggestedDelayMs: 2000
      };
    }

    // Temporary server errors
    if (errorCode >= 500 && errorCode < 600) {
      return { 
        isRetryable: true, 
        reason: 'Server error',
        suggestedDelayMs: 1000
      };
    }

    // Database constraint violations (might be transient)
    if (errorMessage.includes('duplicate key') ||
        errorMessage.includes('unique constraint') ||
        errorMessage.includes('deadlock') ||
        errorMessage.includes('serialization failure')) {
      return { 
        isRetryable: true, 
        reason: 'Database constraint issue',
        suggestedDelayMs: 200
      };
    }

    // Network timeouts
    if (errorMessage.includes('timeout') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ECONNABORTED')) {
      return { 
        isRetryable: true, 
        reason: 'Network timeout',
        suggestedDelayMs: 1000
      };
    }

    // Non-retryable errors
    if (errorCode === 400 || // Bad request
        errorCode === 401 || // Unauthorized (permanent)
        errorCode === 403 || // Forbidden
        errorCode === 404 || // Not found
        errorMessage.toLowerCase().includes('validation') ||
        errorMessage.toLowerCase().includes('invalid') ||
        errorMessage.toLowerCase().includes('not found')) {
      return { 
        isRetryable: false, 
        reason: 'Client error - not retryable'
      };
    }

    // Default to retryable for unknown errors
    return { 
      isRetryable: true, 
      reason: 'Unknown error - defaulting to retryable',
      suggestedDelayMs: 1000
    };
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  static calculateDelay(
    attempt: number, 
    config: RetryConfig, 
    suggestedDelayMs?: number
  ): number {
    const baseDelay = suggestedDelayMs || config.baseDelayMs;
    const exponentialDelay = baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
    
    // Add jitter to prevent thundering herd
    const jitter = config.jitterMs ? Math.random() * config.jitterMs : 0;
    
    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Check if we should retry based on attempt count and error classification
   */
  static shouldRetry(
    attempt: number, 
    maxRetries: number, 
    error: any
  ): boolean {
    if (attempt > maxRetries) {
      return false;
    }

    const errorClassification = this.classifyError(error);
    return errorClassification.isRetryable;
  }
}

/**
 * Enhanced retry function with comprehensive error handling
 */
export async function retryWithStrategy<T>(
  operation: string,
  fn: () => Promise<T>,
  config: RetryConfig,
  logger?: any,
  context?: Record<string, any>
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      if (logger) {
        logger.debug(`${operation} attempt ${attempt}/${config.maxRetries + 1}`, {
          ...context,
          attempt
        });
      }

      const result = await fn();
      
      if (attempt > 1 && logger) {
        logger.info(`${operation} succeeded on attempt ${attempt}`, {
          ...context,
          attempt,
          total_attempts: attempt
        });
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      if (logger) {
        logger.warn(`${operation} failed on attempt ${attempt}`, {
          ...context,
          attempt,
          error: error instanceof Error ? error.message : 'Unknown error',
          error_code: error?.code || error?.status
        });
      }

      // Check if we should retry
      if (!RetryStrategies.shouldRetry(attempt, config.maxRetries, error)) {
        if (logger) {
          const classification = RetryStrategies.classifyError(error);
          logger.error(`${operation} failed permanently`, error, {
            ...context,
            attempt,
            reason: classification.reason,
            is_retryable: classification.isRetryable
          });
        }
        break;
      }

      // Calculate delay for next attempt
      if (attempt <= config.maxRetries) {
        const classification = RetryStrategies.classifyError(error);
        const delay = RetryStrategies.calculateDelay(
          attempt, 
          config, 
          classification.suggestedDelayMs
        );
        
        if (logger) {
          logger.debug(`${operation} retrying in ${delay}ms`, {
            ...context,
            attempt,
            delay_ms: delay,
            next_attempt: attempt + 1
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries exhausted
  if (logger) {
    logger.error(`${operation} failed after ${config.maxRetries + 1} attempts`, lastError, {
      ...context,
      total_attempts: config.maxRetries + 1,
      max_retries: config.maxRetries
    });
  }
  
  throw lastError;
}

/**
 * Specialized retry functions for common operations
 */
export const RetryOperations = {
  /**
   * Retry database operations
   */
  database: <T>(
    operation: string,
    fn: () => Promise<T>,
    logger?: any,
    context?: Record<string, any>
  ) => retryWithStrategy(
    operation,
    fn,
    RetryStrategies.CONFIGS.database,
    logger,
    context
  ),

  /**
   * Retry external API calls
   */
  externalApi: <T>(
    operation: string,
    fn: () => Promise<T>,
    logger?: any,
    context?: Record<string, any>
  ) => retryWithStrategy(
    operation,
    fn,
    RetryStrategies.CONFIGS.external_api,
    logger,
    context
  ),

  /**
   * Retry critical operations
   */
  critical: <T>(
    operation: string,
    fn: () => Promise<T>,
    logger?: any,
    context?: Record<string, any>
  ) => retryWithStrategy(
    operation,
    fn,
    RetryStrategies.CONFIGS.critical,
    logger,
    context
  ),

  /**
   * Retry notification operations
   */
  notification: <T>(
    operation: string,
    fn: () => Promise<T>,
    logger?: any,
    context?: Record<string, any>
  ) => retryWithStrategy(
    operation,
    fn,
    RetryStrategies.CONFIGS.notification,
    logger,
    context
  )
};
