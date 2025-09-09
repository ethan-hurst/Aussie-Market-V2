import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  errorNotificationManager, 
  dismissAllNotifications,
  notifyPaymentError,
  notifyWebhookFailure,
  notifyNetworkError
} from '$lib/errorNotificationSystem';
import { categorizePaymentError, mapApiErrorToMessage } from '$lib/errors';

/**
 * Simplified integration tests for payment error scenarios
 * Tests error handling logic without component rendering
 */
describe('Payment Error Scenarios Integration', () => {
  beforeEach(() => {
    dismissAllNotifications();
    
    global.fetch = vi.fn();
    
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      location: { reload: vi.fn(), href: 'http://localhost:5173' },
      navigator: { onLine: true }
    });
    
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    dismissAllNotifications();
    vi.restoreAllMocks();
  });

  describe('Stripe Payment Intent Failures', () => {
    it('should handle card declined with insufficient funds', async () => {
      const stripeError = {
        error: {
          type: 'card_error',
          code: 'card_declined',
          decline_code: 'insufficient_funds',
          message: 'Your card has insufficient funds.'
        }
      };

      const orderId = 'order-insufficient-funds';

      const paymentInfo = categorizePaymentError(stripeError.error.message);
      expect(paymentInfo.type).toBe('card_error');
      expect(paymentInfo.canRetry).toBe(false);
      expect(paymentInfo.requiresNewPayment).toBe(true);

      const notificationId = notifyPaymentError(stripeError, orderId, { persistent: true });
      expect(notificationId).toBeDefined();

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.paymentErrors).toBe(1);
      expect(stats.persistent).toBe(1);
    });

    it('should handle expired card error', async () => {
      const stripeError = {
        error: {
          type: 'card_error',
          code: 'expired_card',
          message: 'Your card has expired.'
        }
      };

      const orderId = 'order-expired-card';
      
      const notificationId = notifyPaymentError(stripeError, orderId, { persistent: true });
      expect(notificationId).toBeDefined();

      // Test categorization
      const paymentInfo = categorizePaymentError(stripeError.error.message);
      expect(paymentInfo.type).toBe('card_error');
      expect(paymentInfo.requiresNewPayment).toBe(true);

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.byType.warning).toBe(1);
    });

    it('should handle CVC check failure', async () => {
      const stripeError = {
        error: {
          type: 'card_error',
          code: 'incorrect_cvc',
          message: 'Your card security code is incorrect.'
        }
      };

      const orderId = 'order-incorrect-cvc';
      
      const notificationId = notifyPaymentError(stripeError, orderId, { persistent: true });
      expect(notificationId).toBeDefined();

      // Verify categorization doesn't allow retry for card validation errors
      const paymentInfo = categorizePaymentError(stripeError.error.message);
      expect(paymentInfo.canRetry).toBe(false);
      expect(paymentInfo.requiresNewPayment).toBe(true);
    });
  });

  describe('Network and Connectivity Errors', () => {
    it('should handle connection timeout during payment', async () => {
      const networkError = 'Request timed out during payment processing';
      const orderId = 'order-timeout';

      Object.defineProperty(window.navigator, 'onLine', {
        writable: true,
        value: false
      });

      const paymentInfo = categorizePaymentError(networkError);
      expect(paymentInfo.type).toBe('network_error');
      expect(paymentInfo.canRetry).toBe(true);

      const notificationId = notifyPaymentError(networkError, orderId);
      expect(notificationId).toBeDefined();

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.paymentErrors).toBe(1);
    });

    it('should handle DNS resolution failures', async () => {
      const networkError = 'Failed to resolve payment server DNS';
      
      const notificationId = notifyNetworkError(networkError);
      expect(notificationId).toBeDefined();

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.byType.error).toBe(1);
    });

    it('should handle intermittent connectivity with proper categorization', async () => {
      const networkError = 'Intermittent connection failure';
      
      const paymentInfo = categorizePaymentError(networkError);
      expect(paymentInfo.type).toBe('network_error');
      expect(paymentInfo.canRetry).toBe(true);

      const notificationId = notifyNetworkError(networkError);
      expect(notificationId).toBeDefined();
    });
  });

  describe('Webhook Processing Failures', () => {
    it('should handle webhook timeout with order status uncertainty', async () => {
      const orderId = 'order-webhook-timeout';
      const webhookError = 'Webhook processing timeout after 30 seconds';

      const notificationId = notifyWebhookFailure(orderId, webhookError, {
        showRetry: true,
        showPolling: true
      });

      expect(notificationId).toBeDefined();

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.byType.warning).toBe(1);
      expect(stats.persistent).toBe(1);
    });

    it('should handle webhook endpoint unavailability', async () => {
      const orderId = 'order-webhook-unavailable';
      const webhookError = 'Webhook endpoint returned 503 Service Unavailable';

      const notificationId = notifyWebhookFailure(orderId, webhookError, {
        showRetry: true
      });

      expect(notificationId).toBeDefined();

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.byType.warning).toBe(1);
    });

    it('should handle webhook signature validation failure', async () => {
      const orderId = 'order-webhook-signature';
      const webhookError = 'Webhook signature validation failed';

      const notificationId = notifyWebhookFailure(orderId, webhookError, {
        showPolling: true // Only polling, no retry for security issues
      });

      expect(notificationId).toBeDefined();
      
      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(1);
      expect(stats.persistent).toBe(1);
    });
  });

  describe('Payment Processing Edge Cases', () => {
    it('should handle 3D Secure authentication failure', async () => {
      const threeDSError = {
        error: {
          type: 'card_error',
          code: 'authentication_required',
          message: '3D Secure authentication failed or was declined by the customer.'
        }
      };

      const orderId = 'order-3ds-fail';
      
      const paymentInfo = categorizePaymentError(threeDSError.error.message);
      expect(paymentInfo.type).toBe('card_error');
      expect(paymentInfo.requiresNewPayment).toBe(true);

      const notificationId = notifyPaymentError(threeDSError, orderId, { persistent: true });
      expect(notificationId).toBeDefined();
    });

    it('should handle rate limiting during high-traffic periods', async () => {
      const rateLimitError = 'Too many requests. Please try again in a moment.';
      
      const paymentInfo = categorizePaymentError(rateLimitError);
      expect(paymentInfo.canRetry).toBe(true);

      const notificationId = notifyPaymentError(rateLimitError, 'order-rate-limit');
      expect(notificationId).toBeDefined();
    });

    it('should handle payment method authentication timeout', async () => {
      const authTimeoutError = 'Payment authentication timed out';
      const orderId = 'order-auth-timeout';

      const paymentInfo = categorizePaymentError(authTimeoutError);
      expect(paymentInfo.type).toBe('processing_error');
      expect(paymentInfo.canRetry).toBe(true);

      const notificationId = notifyPaymentError(authTimeoutError, orderId, { persistent: true });
      expect(notificationId).toBeDefined();
    });
  });

  describe('Order State Conflicts', () => {
    it('should handle payment attempt on already-paid order', async () => {
      const conflictError = 'Order cannot be paid for - already in paid state';
      const orderId = 'order-already-paid';

      const paymentInfo = categorizePaymentError(conflictError);
      expect(paymentInfo.shouldContactSupport).toBe(true);

      const notificationId = notifyPaymentError(conflictError, orderId, { persistent: true });
      expect(notificationId).toBeDefined();
    });

    it('should handle expired order payment attempt', async () => {
      const expiredError = 'Payment window for this order has expired';
      const orderId = 'order-expired';

      const paymentInfo = categorizePaymentError(expiredError);
      expect(paymentInfo.shouldContactSupport).toBe(true);

      const notificationId = notifyPaymentError(expiredError, orderId, { persistent: true });
      expect(notificationId).toBeDefined();
    });

    it('should handle concurrent payment attempts', async () => {
      const concurrencyError = 'Another payment is already in progress for this order';
      const orderId = 'order-concurrent';

      const notificationId = notifyPaymentError(concurrencyError, orderId, { persistent: true });
      expect(notificationId).toBeDefined();

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.persistent).toBe(1);
    });
  });

  describe('Real-World Error Combinations', () => {
    it('should handle network error followed by webhook timeout', async () => {
      const orderId = 'order-combo-error';

      const networkNotificationId = notifyNetworkError('Connection timeout during payment submission');
      const webhookNotificationId = notifyWebhookFailure(orderId, 'Webhook processing delay', {
        showPolling: true
      });

      expect(networkNotificationId).toBeDefined();
      expect(webhookNotificationId).toBeDefined();

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(2);
      expect(stats.byType.error).toBe(1); // Network error
      expect(stats.byType.warning).toBe(1); // Webhook error
    });

    it('should handle multiple card decline attempts', async () => {
      const orderId = 'order-multiple-declines';

      const firstDecline = notifyPaymentError('card declined', orderId, { persistent: true });
      const secondDecline = notifyPaymentError('insufficient funds', orderId, { persistent: true });

      expect(firstDecline).toBeDefined();
      expect(secondDecline).toBeDefined();

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(2);
      expect(stats.paymentErrors).toBe(2);
      expect(stats.persistent).toBe(2);
    });

    it('should prioritize critical errors over warnings', async () => {
      const orderId = 'order-priority-test';

      const webhookWarning = notifyWebhookFailure(orderId, 'Webhook processing delay');
      const criticalError = notifyPaymentError('card declined', orderId, { persistent: true });

      expect(webhookWarning).toBeDefined();
      expect(criticalError).toBeDefined();

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(2);
      expect(stats.byType.warning).toBe(2); // Both webhook and payment card errors are warnings
      expect(stats.persistent).toBe(2); // Both are persistent
    });
  });

  describe('Error Recovery Success Scenarios', () => {
    it('should handle successful retry after network error', async () => {
      const networkError = 'connection timeout';
      const orderId = 'order-retry-success';

      const errorNotificationId = notifyNetworkError(networkError);
      expect(errorNotificationId).toBeDefined();

      // Simulate successful retry outcome
      const successId = errorNotificationManager.addSuccessNotification(
        'Payment Successful',
        'Your payment has been processed successfully',
        false
      );

      expect(successId).toBeDefined();

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(2);
      expect(stats.byType.error).toBe(1);
      expect(stats.byType.success).toBe(1);
    });

    it('should handle webhook recovery after status polling', async () => {
      const orderId = 'order-webhook-recovery';
      const webhookError = 'webhook timeout';

      const errorNotificationId = notifyWebhookFailure(orderId, webhookError, { showPolling: true });
      expect(errorNotificationId).toBeDefined();

      // After status check, simulate success
      const successId = errorNotificationManager.addSuccessNotification(
        'Payment Confirmed',
        `Order ${orderId} has been successfully processed`,
        false
      );

      expect(successId).toBeDefined();

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(2);
      expect(stats.byType.warning).toBe(1);
      expect(stats.byType.success).toBe(1);
    });
  });

  describe('Error Analytics and Monitoring', () => {
    it('should track error patterns for monitoring', async () => {
      const errorPattern = [
        { error: 'network timeout', type: 'network' },
        { error: 'webhook delay', type: 'webhook', orderId: 'order-1' },
        { error: 'network timeout', type: 'network' },
        { error: 'webhook delay', type: 'webhook', orderId: 'order-2' },
        { error: 'payment failed', type: 'payment', orderId: 'order-3' }
      ];

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

      const stats = errorNotificationManager.getNotificationStats();
      expect(stats.total).toBe(5);
      expect(stats.byType.error).toBe(2); // Network errors
      expect(stats.byType.warning).toBe(3); // Webhook + payment errors
      expect(stats.paymentErrors).toBe(5); // All are payment-related
    });

    it('should provide comprehensive error statistics', async () => {
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
  });

  describe('Error Message Mapping', () => {
    it('should map Stripe errors to user-friendly messages', async () => {
      const stripeErrors = [
        { code: 'card_declined', message: 'Your card was declined.' },
        { code: 'expired_card', message: 'Your card has expired.' },
        { code: 'insufficient_funds', message: 'Your card has insufficient funds.' },
        { code: 'incorrect_cvc', message: 'Your card security code is incorrect.' }
      ];

      stripeErrors.forEach(error => {
        const mappedMessage = mapApiErrorToMessage(error.message);
        expect(mappedMessage).toBeTruthy();
        expect(mappedMessage.length).toBeGreaterThan(10); // Should be meaningful message
        
        const category = categorizePaymentError(error.message);
        expect(category.type).toBe('card_error');
        expect(category.userMessage).toBe(mappedMessage);
      });
    });

    it('should map network errors appropriately', async () => {
      const networkErrors = [
        'network error',
        'connection timeout',
        'fetch failed',
        'DNS resolution failed'
      ];

      networkErrors.forEach(error => {
        const mappedMessage = mapApiErrorToMessage(error);
        expect(mappedMessage).toContain('connection'); // Should mention connection
        
        const category = categorizePaymentError(error);
        expect(category.type).toBe('network_error');
        expect(category.canRetry).toBe(true);
      });
    });

    it('should map webhook errors correctly', async () => {
      const webhookErrors = [
        'webhook timeout',
        'webhook processing failed',
        'webhook signature invalid'
      ];

      webhookErrors.forEach(error => {
        const mappedMessage = mapApiErrorToMessage(error);
        expect(mappedMessage).toContain('processing'); // Should mention processing
        
        const category = categorizePaymentError(error);
        expect(category.type).toBe('webhook_error');
        expect(category.shouldContactSupport).toBe(true);
      });
    });
  });
});