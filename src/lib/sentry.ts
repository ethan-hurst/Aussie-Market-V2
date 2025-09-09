/**
 * Sentry configuration and initialization for comprehensive error tracking
 * Supports both client-side and server-side error tracking
 */

import * as Sentry from '@sentry/sveltekit';
import type { Transaction } from '@sentry/types';
import { dev } from '$app/environment';
import { env } from './env.js';

// Sentry configuration options
interface SentryConfig {
  dsn: string;
  environment: string;
  tracesSampleRate: number;
  profilesSampleRate: number;
  beforeSend?: (event: Sentry.Event) => Sentry.Event | null;
  beforeSendTransaction?: (event: any) => any | null;
  integrations: any[];
  initialScope?: {
    tags?: Record<string, string>;
    user?: {
      id?: string;
      email?: string;
      username?: string;
    };
  };
}

/**
 * Initialize Sentry with environment-specific configuration
 */
export function initSentry(): void {
  const dsn = env.PUBLIC_SENTRY_DSN || env.SENTRY_DSN;
  
  if (!dsn) {
    console.warn('Sentry DSN not configured - error tracking disabled');
    return;
  }

  const config: SentryConfig = {
    dsn,
    environment: dev ? 'development' : 'production',
    tracesSampleRate: dev ? 1.0 : 0.1, // 100% in dev, 10% in production
    profilesSampleRate: dev ? 1.0 : 0.1, // 100% in dev, 10% in production
    integrations: [
      // Add custom integrations as needed
      // Note: Integrations are automatically included in SvelteKit
    ],
    beforeSend: (event) => {
      // Filter out development noise
      if (dev) {
        // Skip certain errors in development
        if (event.exception) {
          const error = event.exception.values?.[0];
          if (error?.type === 'ChunkLoadError' || error?.type === 'Loading chunk failed') {
            return null; // Don't send chunk load errors in development
          }
        }
      }
      
      // Add custom context
      event.tags = {
        ...event.tags,
        component: 'sveltekit',
        version: '1.0.0'
      };
      
      return event;
    },
    beforeSendTransaction: (event) => {
      // Filter out health check transactions
      if (event.transaction?.includes('/health') || event.transaction?.includes('/ping')) {
        return null;
      }
      
      return event;
    },
    initialScope: {
      tags: {
        environment: dev ? 'development' : 'production',
        platform: 'web'
      }
    }
  };

  // Initialize Sentry
  Sentry.init(config);
  
  console.log(`Sentry initialized for ${config.environment} environment`);
}

/**
 * Set user context for error tracking
 */
export function setSentryUser(user: {
  id: string;
  email?: string;
  username?: string;
}): void {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username
  });
}

/**
 * Clear user context
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

/**
 * Set custom tags for error tracking
 */
export function setSentryTags(tags: Record<string, string>): void {
  Sentry.setTags(tags);
}

/**
 * Set custom context for error tracking
 */
export function setSentryContext(key: string, context: Record<string, any>): void {
  Sentry.setContext(key, context);
}

/**
 * Capture an exception with custom context
 */
export function captureException(error: Error, context?: {
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  user?: {
    id: string;
    email?: string;
    username?: string;
  };
}): string {
  if (context?.tags) {
    Sentry.setTags(context.tags);
  }
  
  if (context?.extra) {
    Sentry.setContext('extra', context.extra);
  }
  
  if (context?.user) {
    Sentry.setUser(context.user);
  }
  
  return Sentry.captureException(error);
}

/**
 * Capture a message with custom context
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: {
  tags?: Record<string, string>;
  extra?: Record<string, any>;
}): string {
  if (context?.tags) {
    Sentry.setTags(context.tags);
  }
  
  if (context?.extra) {
    Sentry.setContext('extra', context.extra);
  }
  
  return Sentry.captureMessage(message, level);
}

/**
 * Start a transaction for performance monitoring
 */
export function startTransaction(name: string, op: string = 'custom'): Transaction {
  return Sentry.startTransaction({
    name,
    op
  });
}

/**
 * Create a span for performance monitoring
 */
export function startSpan<T>(name: string, op: string, callback: (span: Sentry.Span) => T): T {
  return Sentry.startSpan({
    name,
    op
  }, callback);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: {
  message: string;
  category?: string;
  level?: Sentry.SeverityLevel;
  data?: Record<string, any>;
}): void {
  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Configure Sentry for API routes
 */
export function configureApiSentry(): void {
  // Set up API-specific configuration
  Sentry.setTag('component', 'api');
  
  // Add middleware for API error tracking
  Sentry.setContext('api', {
    framework: 'sveltekit',
    version: '2.0.0'
  });
}

/**
 * Configure Sentry for Edge Functions
 */
export function configureEdgeFunctionSentry(functionName: string): void {
  // Set up Edge Function-specific configuration
  Sentry.setTag('component', 'edge-function');
  Sentry.setTag('function-name', functionName);
  
  Sentry.setContext('edge-function', {
    name: functionName,
    runtime: 'deno',
    platform: 'supabase'
  });
}

/**
 * Error boundary for Svelte components
 */
export function withSentryErrorBoundary<T extends Record<string, any>>(
  component: T,
  options?: {
    fallback?: (error: Error, errorInfo: any) => any;
    onError?: (error: Error, errorInfo: any) => void;
  }
): T {
  return {
    ...component,
    onError: (error: Error, errorInfo: any) => {
      // Capture the error
      captureException(error, {
        tags: {
          component: 'svelte-component',
          errorBoundary: 'true'
        },
        extra: {
          errorInfo,
          componentName: component.constructor?.name || 'Unknown'
        }
      });
      
      // Call custom error handler if provided
      if (options?.onError) {
        options.onError(error, errorInfo);
      }
      
      // Call original onError if it exists
      if (component.onError) {
        component.onError(error, errorInfo);
      }
    }
  };
}

/**
 * Performance monitoring for database operations
 */
export function withDatabaseMonitoring<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  return startSpan(`db.${operation}`, 'db', async (span) => {
    try {
      const result = await fn();
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('internal_error');
      captureException(error as Error, {
        tags: {
          operation: `db.${operation}`,
          component: 'database'
        }
      });
      throw error;
    }
  });
}

/**
 * Performance monitoring for API operations
 */
export function withApiMonitoring<T>(
  endpoint: string,
  method: string,
  fn: () => Promise<T>
): Promise<T> {
  return startSpan(`api.${method.toLowerCase()}.${endpoint}`, 'http.server', async (span) => {
    span.setTag('http.method', method);
    span.setTag('http.route', endpoint);
    
    try {
      const result = await fn();
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('internal_error');
      captureException(error as Error, {
        tags: {
          endpoint,
          method,
          component: 'api'
        }
      });
      throw error;
    }
  });
}

/**
 * Performance monitoring for webhook operations
 */
export function withWebhookMonitoring<T>(
  webhookType: string,
  fn: () => Promise<T>
): Promise<T> {
  return startSpan(`webhook.${webhookType}`, 'http.server', async (span) => {
    span.setTag('webhook.type', webhookType);
    
    try {
      const result = await fn();
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('internal_error');
      captureException(error as Error, {
        tags: {
          webhookType,
          component: 'webhook'
        }
      });
      throw error;
    }
  });
}

// Export Sentry instance for direct access if needed
export { Sentry };
