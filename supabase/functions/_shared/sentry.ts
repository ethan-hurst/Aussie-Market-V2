/**
 * Sentry integration for Supabase Edge Functions
 * Provides error tracking and performance monitoring for Edge Functions
 */

// Simple Sentry-like interface for Edge Functions
// In a real implementation, you would use the Sentry SDK for Deno

export interface SentryEvent {
  event_id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  message?: string;
  exception?: {
    values: Array<{
      type: string;
      value: string;
      stacktrace?: {
        frames: Array<{
          filename?: string;
          function?: string;
          lineno?: number;
          colno?: number;
        }>;
      };
    }>;
  };
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  user?: {
    id?: string;
    email?: string;
    username?: string;
  };
  contexts?: Record<string, any>;
  fingerprint?: string[];
}

export interface SentryTransaction {
  event_id: string;
  timestamp: string;
  type: 'transaction';
  transaction: string;
  spans: Array<{
    span_id: string;
    trace_id: string;
    parent_span_id?: string;
    op: string;
    description?: string;
    start_timestamp: number;
    timestamp: number;
    status?: string;
    tags?: Record<string, string>;
  }>;
  tags?: Record<string, string>;
  extra?: Record<string, any>;
}

class EdgeFunctionSentry {
  private dsn: string | null = null;
  private environment: string = 'production';
  private enabled: boolean = false;

  constructor() {
    // Get Sentry DSN from environment
    this.dsn = Deno.env.get('SENTRY_DSN') || Deno.env.get('PUBLIC_SENTRY_DSN') || null;
    this.environment = Deno.env.get('NODE_ENV') || 'production';
    this.enabled = !!this.dsn;
  }

  /**
   * Initialize Sentry for Edge Functions
   */
  init(): void {
    if (!this.enabled) {
      console.log('Sentry not configured - error tracking disabled');
      return;
    }

    console.log(`Sentry initialized for Edge Functions (${this.environment})`);
  }

  /**
   * Capture an exception
   */
  captureException(error: Error, context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    user?: {
      id: string;
      email?: string;
      username?: string;
    };
  }): string {
    if (!this.enabled) {
      console.error('Sentry not enabled - error not captured:', error.message);
      return 'no-sentry';
    }

    const eventId = this.generateEventId();
    const event: SentryEvent = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      level: 'error',
      message: error.message,
      exception: {
        values: [{
          type: error.name,
          value: error.message,
          stacktrace: {
            frames: this.parseStackTrace(error.stack)
          }
        }]
      },
      tags: {
        environment: this.environment,
        platform: 'deno',
        component: 'edge-function',
        ...context?.tags
      },
      extra: {
        ...context?.extra,
        error_name: error.name,
        error_message: error.message
      },
      user: context?.user
    };

    this.sendEvent(event);
    return eventId;
  }

  /**
   * Capture a message
   */
  captureMessage(message: string, level: 'debug' | 'info' | 'warning' | 'error' | 'fatal' = 'info', context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
  }): string {
    if (!this.enabled) {
      console.log('Sentry not enabled - message not captured:', message);
      return 'no-sentry';
    }

    const eventId = this.generateEventId();
    const event: SentryEvent = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      level,
      message,
      tags: {
        environment: this.environment,
        platform: 'deno',
        component: 'edge-function',
        ...context?.tags
      },
      extra: context?.extra
    };

    this.sendEvent(event);
    return eventId;
  }

  /**
   * Start a transaction for performance monitoring
   */
  startTransaction(name: string, op: string = 'custom'): {
    finish: () => void;
    setTag: (key: string, value: string) => void;
    setData: (key: string, value: any) => void;
  } {
    const startTime = Date.now();
    const transactionId = this.generateEventId();
    const traceId = this.generateEventId();

    return {
      finish: () => {
        if (!this.enabled) return;

        const duration = Date.now() - startTime;
        const transaction: SentryTransaction = {
          event_id: transactionId,
          timestamp: new Date().toISOString(),
          type: 'transaction',
          transaction: name,
          spans: [{
            span_id: transactionId,
            trace_id: traceId,
            op,
            description: name,
            start_timestamp: startTime / 1000,
            timestamp: Date.now() / 1000,
            status: 'ok'
          }],
          tags: {
            environment: this.environment,
            platform: 'deno',
            component: 'edge-function'
          },
          extra: {
            duration_ms: duration
          }
        };

        this.sendEvent(transaction);
      },
      setTag: (key: string, value: string) => {
        // Tags would be stored and sent with the transaction
      },
      setData: (key: string, value: any) => {
        // Data would be stored and sent with the transaction
      }
    };
  }

  /**
   * Set user context
   */
  setUser(user: {
    id: string;
    email?: string;
    username?: string;
  }): void {
    // User context would be stored and sent with events
    console.log('Sentry user context set:', user.id);
  }

  /**
   * Set tags
   */
  setTags(tags: Record<string, string>): void {
    // Tags would be stored and sent with events
    console.log('Sentry tags set:', Object.keys(tags));
  }

  /**
   * Set context
   */
  setContext(key: string, context: Record<string, any>): void {
    // Context would be stored and sent with events
    console.log(`Sentry context set for ${key}:`, Object.keys(context));
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return crypto.randomUUID();
  }

  /**
   * Parse stack trace from error
   */
  private parseStackTrace(stack?: string): Array<{
    filename?: string;
    function?: string;
    lineno?: number;
    colno?: number;
  }> {
    if (!stack) return [];

    const frames: Array<{
      filename?: string;
      function?: string;
      lineno?: number;
      colno?: number;
    }> = [];

    const lines = stack.split('\n');
    for (const line of lines) {
      // Simple stack trace parsing - in a real implementation you'd use a proper parser
      const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      if (match) {
        frames.push({
          function: match[1],
          filename: match[2],
          lineno: parseInt(match[3]),
          colno: parseInt(match[4])
        });
      }
    }

    return frames;
  }

  /**
   * Send event to Sentry
   */
  private async sendEvent(event: SentryEvent | SentryTransaction): Promise<void> {
    if (!this.dsn) return;

    try {
      // In a real implementation, you would send this to Sentry's API
      // For now, we'll just log it
      console.log('Sentry event:', JSON.stringify({
        type: 'sentry_event',
        event_id: event.event_id,
        level: 'level' in event ? event.level : 'transaction',
        message: 'message' in event ? event.message : `Transaction: ${event.transaction}`,
        timestamp: event.timestamp,
        tags: event.tags,
        extra: event.extra
      }));
    } catch (error) {
      console.error('Failed to send Sentry event:', error);
    }
  }
}

// Global Sentry instance for Edge Functions
export const sentry = new EdgeFunctionSentry();

// Initialize Sentry
sentry.init();

// Export convenience functions
export const captureException = (error: Error, context?: any) => sentry.captureException(error, context);
export const captureMessage = (message: string, level?: any, context?: any) => sentry.captureMessage(message, level, context);
export const startTransaction = (name: string, op?: string) => sentry.startTransaction(name, op);
export const setUser = (user: any) => sentry.setUser(user);
export const setTags = (tags: Record<string, string>) => sentry.setTags(tags);
export const setContext = (key: string, context: Record<string, any>) => sentry.setContext(key, context);
