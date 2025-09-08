/**
 * Comprehensive API error handler with Sentry integration
 * Provides consistent error handling across all API routes
 */

import { captureException, captureMessage, setSentryTags, setSentryContext } from '$lib/sentry';
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export interface ApiError {
  message: string;
  status: number;
  code?: string;
  details?: any;
  correlationId?: string;
}

export class ApiErrorHandler {
  /**
   * Handle API errors with Sentry integration
   */
  static async handleError(
    error: Error | ApiError,
    event: RequestEvent,
    context?: {
      operation?: string;
      userId?: string;
      additionalData?: Record<string, any>;
    }
  ): Promise<Response> {
    const correlationId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    
    // Set Sentry context
    setSentryTags({
      path: event.url.pathname,
      method: event.request.method,
      correlationId,
      component: 'api'
    });

    if (context?.operation) {
      setSentryContext('operation', {
        name: context.operation,
        userId: context.userId,
        ...context.additionalData
      });
    }

    // Determine error type and status
    let apiError: ApiError;
    
    if (error instanceof Error) {
      // Standard Error object
      apiError = this.categorizeError(error, correlationId);
    } else {
      // Custom ApiError object
      apiError = error;
    }

    // Capture in Sentry
    if (apiError.status >= 500) {
      // Server errors - capture as exceptions
      captureException(error instanceof Error ? error : new Error(apiError.message), {
        tags: {
          error_type: 'api_error',
          status_code: apiError.status.toString(),
          operation: context?.operation || 'unknown'
        },
        extra: {
          correlationId,
          path: event.url.pathname,
          method: event.request.method,
          userId: context?.userId,
          ...context?.additionalData
        }
      });
    } else {
      // Client errors - capture as messages
      captureMessage(`API Error: ${apiError.message}`, 'warning', {
        tags: {
          error_type: 'api_error',
          status_code: apiError.status.toString(),
          operation: context?.operation || 'unknown'
        },
        extra: {
          correlationId,
          path: event.url.pathname,
          method: event.request.method,
          userId: context?.userId,
          ...context?.additionalData
        }
      });
    }

    // Log error
    console.error('API Error:', {
      correlationId,
      path: event.url.pathname,
      method: event.request.method,
      status: apiError.status,
      message: apiError.message,
      code: apiError.code,
      userId: context?.userId
    });

    // Return appropriate response
    return json(
      {
        error: apiError.message,
        code: apiError.code,
        correlationId,
        timestamp: new Date().toISOString()
      },
      { status: apiError.status }
    );
  }

  /**
   * Categorize and convert Error to ApiError
   */
  private static categorizeError(error: Error, correlationId: string): ApiError {
    // Database errors
    if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
      return {
        message: 'Resource already exists',
        status: 409,
        code: 'DUPLICATE_RESOURCE',
        correlationId
      };
    }

    if (error.message.includes('foreign key') || error.message.includes('referential integrity')) {
      return {
        message: 'Referenced resource not found',
        status: 400,
        code: 'INVALID_REFERENCE',
        correlationId
      };
    }

    if (error.message.includes('not found') || error.message.includes('does not exist')) {
      return {
        message: 'Resource not found',
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        correlationId
      };
    }

    // Authentication errors
    if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
      return {
        message: 'Authentication required',
        status: 401,
        code: 'UNAUTHORIZED',
        correlationId
      };
    }

    if (error.message.includes('forbidden') || error.message.includes('permission')) {
      return {
        message: 'Insufficient permissions',
        status: 403,
        code: 'FORBIDDEN',
        correlationId
      };
    }

    // Validation errors
    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return {
        message: 'Invalid input data',
        status: 400,
        code: 'VALIDATION_ERROR',
        correlationId
      };
    }

    // Rate limiting
    if (error.message.includes('rate limit') || error.message.includes('too many requests')) {
      return {
        message: 'Rate limit exceeded',
        status: 429,
        code: 'RATE_LIMITED',
        correlationId
      };
    }

    // Network/timeout errors
    if (error.message.includes('timeout') || error.message.includes('network')) {
      return {
        message: 'Request timeout',
        status: 408,
        code: 'TIMEOUT',
        correlationId
      };
    }

    // Default to internal server error
    return {
      message: 'Internal server error',
      status: 500,
      code: 'INTERNAL_ERROR',
      correlationId
    };
  }

  /**
   * Handle validation errors
   */
  static handleValidationError(
    validationErrors: Record<string, string[]>,
    event: RequestEvent,
    context?: { operation?: string; userId?: string }
  ): Response {
    const correlationId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    captureMessage('Validation Error', 'warning', {
      tags: {
        error_type: 'validation_error',
        operation: context?.operation || 'unknown'
      },
      extra: {
        correlationId,
        path: event.url.pathname,
        method: event.request.method,
        validationErrors,
        userId: context?.userId
      }
    });

    return json(
      {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validationErrors,
        correlationId,
        timestamp: new Date().toISOString()
      },
      { status: 400 }
    );
  }

  /**
   * Handle database errors
   */
  static handleDatabaseError(
    error: Error,
    event: RequestEvent,
    context?: { operation?: string; userId?: string; query?: string }
  ): Response {
    const correlationId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    captureException(error, {
      tags: {
        error_type: 'database_error',
        operation: context?.operation || 'unknown'
      },
      extra: {
        correlationId,
        path: event.url.pathname,
        method: event.request.method,
        userId: context?.userId,
        query: context?.query
      }
    });

    return json(
      {
        error: 'Database operation failed',
        code: 'DATABASE_ERROR',
        correlationId,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }

  /**
   * Handle Stripe errors
   */
  static handleStripeError(
    error: Error,
    event: RequestEvent,
    context?: { operation?: string; userId?: string; stripeError?: any }
  ): Response {
    const correlationId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    captureException(error, {
      tags: {
        error_type: 'stripe_error',
        operation: context?.operation || 'unknown'
      },
      extra: {
        correlationId,
        path: event.url.pathname,
        method: event.request.method,
        userId: context?.userId,
        stripeError: context?.stripeError
      }
    });

    return json(
      {
        error: 'Payment processing failed',
        code: 'STRIPE_ERROR',
        correlationId,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }

  /**
   * Handle webhook errors
   */
  static handleWebhookError(
    error: Error,
    event: RequestEvent,
    context?: { webhookType?: string; eventId?: string; userId?: string }
  ): Response {
    const correlationId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    captureException(error, {
      tags: {
        error_type: 'webhook_error',
        webhook_type: context?.webhookType || 'unknown'
      },
      extra: {
        correlationId,
        path: event.url.pathname,
        method: event.request.method,
        eventId: context?.eventId,
        userId: context?.userId
      }
    });

    return json(
      {
        error: 'Webhook processing failed',
        code: 'WEBHOOK_ERROR',
        correlationId,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Convenience function for common error handling
export async function handleApiError(
  error: Error | ApiError,
  event: RequestEvent,
  context?: {
    operation?: string;
    userId?: string;
    additionalData?: Record<string, any>;
  }
): Promise<Response> {
  return ApiErrorHandler.handleError(error, event, context);
}
