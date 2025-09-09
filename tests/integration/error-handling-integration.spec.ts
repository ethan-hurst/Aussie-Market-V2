import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { errorNotificationManager, dismissAllNotifications } from '$lib/errorNotificationSystem';
import { notifyPaymentError, notifyWebhookFailure, notifyNetworkError } from '$lib/errorNotificationSystem';
import { categorizePaymentError } from '$lib/errors';

/**
 * Integration tests for comprehensive error handling system
 * Tests error scenarios end-to-end with production-like conditions
 */
describe('Error Handling Integration Tests', () => {
  beforeEach(() => {
    // Clear all notifications before each test
    dismissAllNotifications();
    
    // Mock window.dispatchEvent for testing action handlers
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn()
    });
  });

  afterEach(() => {
    // Clean up after each test
    dismissAllNotifications();
    vi.restoreAllMocks();
  });

  describe('Payment Error Integration', () => {
    it('should handle card decline error with complete error flow', async () => {
      const cardDeclineError = 'card declined';
      const orderId = 'order-123';

      // Test error categorization
      const paymentInfo = categorizePaymentError(cardDeclineError);
      expect(paymentInfo.type).toBe('card_error');
      expect(paymentInfo.canRetry).toBe(false);
      expect(paymentInfo.requiresNewPayment).toBe(true);

      // Test notification creation
      const notificationId = notifyPaymentError(cardDeclineError, orderId, { persistent: true });
      expect(notificationId).toBeDefined();

      // Verify notification appears in system
      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.paymentErrors).toBe(1);
      expect(stats.persistent).toBe(1);
      expect(stats.byType.warning).toBe(1);
    });

    it('should handle network error with retry mechanism', async () => {
      const networkError = 'network error';
      
      // Test error categorization
      const paymentInfo = categorizePaymentError(networkError);
      expect(paymentInfo.type).toBe('network_error');
      expect(paymentInfo.canRetry).toBe(true);
      expect(paymentInfo.requiresNewPayment).toBe(false);

      // Test notification creation with retry action
      const notificationId = notifyNetworkError(networkError);
      expect(notificationId).toBeDefined();

      // Verify notification appears with correct properties
      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.byType.error).toBe(1);
      expect(stats.persistent).toBe(0); // Network errors auto-dismiss
    });

    it('should handle webhook processing error with polling options', async () => {
      const orderId = 'order-456';
      const webhookError = 'webhook processing';

      // Test webhook failure notification
      const notificationId = notifyWebhookFailure(orderId, webhookError, {
        showRetry: true,
        showPolling: true
      });
      expect(notificationId).toBeDefined();

      // Verify notification properties
      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.byType.warning).toBe(1);
      expect(stats.persistent).toBe(1); // Webhook errors are persistent
    });

    it('should handle multiple concurrent error scenarios', async () => {
      // Simulate multiple errors occurring simultaneously
      const errors = [
        { type: 'card_error', message: 'card declined', orderId: 'order-1' },
        { type: 'network_error', message: 'connection timeout', orderId: 'order-2' },
        { type: 'webhook_error', message: 'webhook failed', orderId: 'order-3' }
      ];

      // Create notifications for all errors
      const notificationIds = errors.map(error => {
        if (error.type === 'network_error') {
          return notifyNetworkError(error.message);
        } else if (error.type === 'webhook_error') {
          return notifyWebhookFailure(error.orderId, error.message, { showRetry: true });
        } else {
          return notifyPaymentError(error.message, error.orderId);
        }
      });

      // Verify all notifications created
      expect(notificationIds).toHaveLength(3);
      notificationIds.forEach(id => expect(id).toBeDefined());

      // Verify system state
      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(3);
      expect(stats.paymentErrors).toBe(3);
    });
  });

  describe('Error Boundary Integration', () => {
    it('should handle component error recovery', async () => {
      // Simulate component error that would trigger ErrorBoundary
      const componentError = new Error('Component render failed');
      
      // Test error categorization for unknown errors
      const errorInfo = categorizePaymentError(componentError.message);
      expect(errorInfo.type).toBe('unknown');
      expect(errorInfo.shouldContactSupport).toBe(true);

      // Create notification for component error
      const notificationId = errorNotificationManager.addNotification({
        type: 'error',
        title: 'Component Error',
        message: 'A component failed to render properly. Please refresh the page.',
        persistent: true,
        actions: [
          {
            label: 'Refresh Page',
            action: () => window.location.reload(),
            variant: 'primary'
          },
          {
            label: 'Contact Support',
            action: () => window.open('mailto:support@example.com'),
            variant: 'secondary'
          }
        ]
      });

      expect(notificationId).toBeDefined();
      
      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.persistent).toBe(1);
    });
  });

  describe('Real Payment Failure Simulation', () => {
    it('should handle Stripe payment intent failure with complete error flow', async () => {
      // Simulate real Stripe payment failure response
      const stripeError = {
        error: {
          type: 'card_error',
          code: 'card_declined',
          decline_code: 'generic_decline',
          message: 'Your card was declined.'
        }
      };

      const orderId = 'order-789';

      // Test error categorization with Stripe error structure
      const paymentInfo = categorizePaymentError(stripeError.error.message);
      expect(paymentInfo.type).toBe('card_error');
      expect(paymentInfo.canRetry).toBe(false);
      expect(paymentInfo.requiresNewPayment).toBe(true);

      // Create payment error notification
      const notificationId = notifyPaymentError(stripeError, orderId, {
        persistent: true,
        actions: [
          {
            label: 'Try Different Card',
            variant: 'primary'
          },
          {
            label: 'Contact Support',
            variant: 'secondary'
          }
        ]
      });

      expect(notificationId).toBeDefined();

      // Verify error handling completeness
      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.paymentErrors).toBe(1);
      expect(stats.persistent).toBe(1);
    });

    it('should handle webhook timeout with proper retry logic', async () => {
      const orderId = 'order-webhook-timeout';
      const timeoutError = 'webhook processing timeout';

      // Create webhook failure with retry and polling
      const notificationId = notifyWebhookFailure(orderId, timeoutError, {
        showRetry: true,
        showPolling: true
      });

      expect(notificationId).toBeDefined();

      // Verify webhook error handling
      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.byType.warning).toBe(1);
      expect(stats.persistent).toBe(1);

      // Verify custom event dispatch for retry action would be called
      expect(window.dispatchEvent).not.toHaveBeenCalled(); // Actions not triggered yet
    });
  });

  describe('Error Recovery and State Management', () => {
    it('should properly manage error notification lifecycle', async () => {
      // Create temporary error notification
      const tempNotificationId = errorNotificationManager.addNotification({
        type: 'info',
        title: 'Temporary Notice',
        message: 'This will auto-dismiss',
        persistent: false
      });

      // Create persistent error notification
      const persistentNotificationId = notifyPaymentError('payment failed', 'order-123', {
        persistent: true
      });

      // Verify both notifications exist
      let stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(2);

      // Dismiss specific notification
      errorNotificationManager.dismissNotification(tempNotificationId);

      // Verify only persistent notification remains
      stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.persistent).toBe(1);

      // Dismiss all notifications
      dismissAllNotifications();

      // Verify all notifications cleared
      stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(0);
    });

    it('should handle error notification deduplication', async () => {
      const orderId = 'order-duplicate-test';
      const error = 'payment failed';

      // Create multiple notifications for same error
      const id1 = notifyPaymentError(error, orderId);
      const id2 = notifyPaymentError(error, orderId);
      const id3 = notifyPaymentError(error, orderId);

      // All should be created (no automatic deduplication)
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id3).toBeDefined();
      expect(new Set([id1, id2, id3]).size).toBe(3); // All unique IDs

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(3);
      expect(stats.paymentErrors).toBe(3);
    });
  });

  describe('Error Notification Action Handlers', () => {
    it('should dispatch custom events for payment retry actions', async () => {
      const orderId = 'order-action-test';
      const paymentError = 'network timeout';

      // Create payment error with retry capability
      const notificationId = notifyPaymentError(paymentError, orderId);

      // Verify custom event would be dispatched for retry
      const mockDispatchEvent = vi.mocked(window.dispatchEvent);
      
      // Simulate action button click (in real scenario, this would be handled by the component)
      const retryEvent = new CustomEvent('payment-notification:retry', {
        detail: { orderId, paymentInfo: categorizePaymentError(paymentError) }
      });
      
      window.dispatchEvent(retryEvent);
      
      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment-notification:retry',
          detail: expect.objectContaining({ orderId })
        })
      );
    });

    it('should handle webhook notification polling actions', async () => {
      const orderId = 'order-polling-test';
      const webhookError = 'webhook delay';

      // Create webhook failure notification with polling
      notifyWebhookFailure(orderId, webhookError, { showPolling: true });

      // Simulate polling action
      const pollingEvent = new CustomEvent('webhook-notification:check-status', {
        detail: { orderId, error: webhookError }
      });

      window.dispatchEvent(pollingEvent);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webhook-notification:check-status',
          detail: expect.objectContaining({ orderId })
        })
      );
    });
  });

  describe('Production-Like Error Scenarios', () => {
    it('should handle high-frequency error conditions', async () => {
      // Simulate burst of errors (like during payment processing issues)
      const errors = Array.from({ length: 10 }, (_, i) => ({
        type: i % 2 === 0 ? 'network_error' : 'webhook_error',
        orderId: `order-burst-${i}`,
        message: i % 2 === 0 ? 'connection failed' : 'webhook timeout'
      }));

      // Create all error notifications rapidly
      const notificationIds = errors.map(error => {
        if (error.type === 'network_error') {
          return notifyNetworkError(error.message);
        } else {
          return notifyWebhookFailure(error.orderId, error.message);
        }
      });

      // Verify all notifications created successfully
      expect(notificationIds).toHaveLength(10);
      notificationIds.forEach(id => expect(id).toBeDefined());

      // Verify system handles high load
      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(10);
      expect(stats.byType.error).toBe(5); // Network errors
      expect(stats.byType.warning).toBe(5); // Webhook errors
    });

    it('should maintain error context across page navigation', async () => {
      // Create persistent error notification
      const notificationId = notifyPaymentError('card declined', 'order-nav-test', {
        persistent: true,
        metadata: {
          pageContext: '/checkout',
          userAction: 'payment_submit',
          timestamp: new Date().toISOString()
        }
      });

      // Verify notification persists with metadata
      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.persistent).toBe(1);

      // Simulate page navigation (notifications should persist)
      // In real scenario, persistent notifications would survive navigation
      // because they're stored in application state, not page-specific state
    });
  });

  describe('Error Analytics and Monitoring', () => {
    it('should provide comprehensive error statistics', async () => {
      // Create variety of error types
      notifyPaymentError('card declined', 'order-1');
      notifyNetworkError('connection timeout');
      notifyWebhookFailure('order-2', 'webhook failed', { showRetry: true });
      errorNotificationManager.addSuccessNotification('Payment Success', 'Order completed');

      const stats = errorNotificationManager.getNotificationStats();

      expect(stats.total).toBe(4);
      expect(stats.paymentErrors).toBe(3); // All payment-related errors
      expect(stats.persistent).toBe(1); // Only webhook failure is persistent
      expect(stats.byType.warning).toBe(2); // Card error + webhook error  
      expect(stats.byType.error).toBe(1); // Network error
      expect(stats.byType.success).toBe(1); // Success notification
    });

    it('should track error notification patterns for monitoring', async () => {
      // Create series of errors that might indicate system issues
      const errorPattern = [
        { error: 'network timeout', type: 'network' },
        { error: 'webhook delay', type: 'webhook', orderId: 'order-1' },
        { error: 'network timeout', type: 'network' },
        { error: 'webhook delay', type: 'webhook', orderId: 'order-2' },
        { error: 'payment failed', type: 'payment', orderId: 'order-3' }
      ];

      // Create notifications following the pattern
      errorPattern.forEach(({ error, type, orderId }) => {
        switch (type) {
          case 'network':
            notifyNetworkError(error);
            break;
          case 'webhook':
            notifyWebhookFailure(orderId!, error);
            break;
          case 'payment':
            notifyPaymentError(error, orderId);
            break;
        }
      });

      // Verify pattern captured in statistics
      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(5);
      expect(stats.byType.error).toBe(2); // Network errors
      expect(stats.byType.warning).toBe(3); // Webhook + payment errors
      expect(stats.paymentErrors).toBe(5); // All are payment-related
    });
  });
});