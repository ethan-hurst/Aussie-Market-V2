/**
 * Client-side hooks for Sentry integration
 * Handles client-side error tracking and performance monitoring
 */

import { initSentry, captureException, setSentryUser, setSentryTags, addBreadcrumb } from '$lib/sentry';
import { dev } from '$app/environment';
import { browser } from '$app/environment';

// Initialize Sentry on the client side
if (browser) {
  initSentry();
  
  // Set up global error handlers
  window.addEventListener('error', (event) => {
    captureException(event.error, {
      tags: {
        component: 'client',
        error_type: 'unhandled_error'
      },
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        message: event.message
      }
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    captureException(new Error(event.reason), {
      tags: {
        component: 'client',
        error_type: 'unhandled_promise_rejection'
      },
      extra: {
        reason: event.reason
      }
    });
  });

  // Add breadcrumb for navigation
  window.addEventListener('popstate', () => {
    addBreadcrumb({
      message: 'Navigation via browser back/forward',
      category: 'navigation',
      level: 'info'
    });
  });

  // Add breadcrumb for console errors
  const originalConsoleError = console.error;
  console.error = (...args) => {
    addBreadcrumb({
      message: args.join(' '),
      category: 'console',
      level: 'error'
    });
    originalConsoleError.apply(console, args);
  };

  // Add breadcrumb for console warnings
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    addBreadcrumb({
      message: args.join(' '),
      category: 'console',
      level: 'warning'
    });
    originalConsoleWarn.apply(console, args);
  };

  console.log('Sentry initialized on client side');
}
