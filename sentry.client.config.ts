/**
 * Sentry configuration for client-side (browser) error tracking
 */

import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';
import { PUBLIC_SENTRY_DSN } from '$env/static/public';

Sentry.init({
  dsn: PUBLIC_SENTRY_DSN,
  environment: dev ? 'development' : 'production',
  
  // Performance monitoring
  tracesSampleRate: dev ? 1.0 : 0.1,
  profilesSampleRate: dev ? 1.0 : 0.1,
  
  // Error filtering
  beforeSend(event) {
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
      component: 'sveltekit-client',
      version: '1.0.0'
    };
    
    return event;
  },
  
  // Transaction filtering
  beforeSendTransaction(event) {
    // Filter out health check transactions
    if (event.transaction?.includes('/health') || event.transaction?.includes('/ping')) {
      return null;
    }
    
    return event;
  },
  
  // Integrations
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Console(),
  ],
  
  // Initial scope
  initialScope: {
    tags: {
      environment: dev ? 'development' : 'production',
      platform: 'browser'
    }
  }
});
