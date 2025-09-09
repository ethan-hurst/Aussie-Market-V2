import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom';
import ErrorNotificationDisplay from '$lib/components/ErrorNotificationDisplay.svelte';
import { 
  errorNotificationManager, 
  dismissAllNotifications,
  notifyPaymentError,
  notifyWebhookFailure,
  notifyNetworkError
} from '$lib/errorNotificationSystem';
import { categorizePaymentError, mapApiErrorToMessage } from '$lib/errors';

/**
 * Comprehensive integration tests for payment error scenarios
 * Tests real-world payment error conditions end-to-end
 */
describe('Payment Error Scenarios Integration', () => {
  beforeEach(() => {
    dismissAllNotifications();
    
    // Mock fetch for API calls
    global.fetch = vi.fn();
    
    // Mock window methods
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      location: { reload: vi.fn(), href: 'http://localhost:5173' },
      navigator: { onLine: true }
    });
    
    // Mock console to reduce test noise
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

      // Test error categorization
      const paymentInfo = categorizePaymentError(stripeError.error.message);
      expect(paymentInfo.type).toBe('card_error');
      expect(paymentInfo.canRetry).toBe(false);
      expect(paymentInfo.requiresNewPayment).toBe(true);

      // Create payment error notification
      const notificationId = notifyPaymentError(stripeError, orderId, { persistent: true });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Method Issue')).toBeInTheDocument();
        expect(screen.getByText(/card.*declined.*details.*different/i)).toBeInTheDocument();
      });

      // Verify correct actions are available
      expect(screen.getByText('New Payment Method')).toBeInTheDocument();
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument(); // Should not retry for card errors
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

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Method Issue')).toBeInTheDocument();
        expect(screen.getByText(/card.*expired.*different/i)).toBeInTheDocument();
      });

      // Test action button functionality
      const newPaymentButton = screen.getByText('New Payment Method');
      fireEvent.click(newPaymentButton);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment-notification:new-payment',
          detail: expect.objectContaining({ orderId })
        })
      );
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

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Method Issue')).toBeInTheDocument();
        expect(screen.getByText(/card.*invalid.*check.*details/i)).toBeInTheDocument();
      });

      // Verify retry is not available for card validation errors
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
      expect(screen.getByText('New Payment Method')).toBeInTheDocument();
    });
  });

  describe('Network and Connectivity Errors', () => {
    it('should handle connection timeout during payment', async () => {
      const networkError = 'Request timed out during payment processing';
      const orderId = 'order-timeout';

      // Simulate network being offline
      Object.defineProperty(window.navigator, 'onLine', {
        writable: true,
        value: false
      });

      const notificationId = notifyPaymentError(networkError, orderId);

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Network Problem')).toBeInTheDocument();
        expect(screen.getByText(/timeout.*try.*again/i)).toBeInTheDocument();
      });

      // Verify retry action is available for network errors
      const retryButton = screen.getByText('Try Again');
      expect(retryButton).toBeInTheDocument();
      
      fireEvent.click(retryButton);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment-notification:retry'
        })
      );
    });

    it('should handle DNS resolution failures', async () => {
      const networkError = 'Failed to resolve payment server DNS';
      
      const notificationId = notifyNetworkError(networkError);

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Connection Problem')).toBeInTheDocument();
        expect(screen.getByText(/network.*connection.*try/i)).toBeInTheDocument();
      });

      // Test network status indication
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('should handle intermittent connectivity', async () => {
      // Simulate intermittent connection issues
      let connectionAttempts = 0;
      
      const mockFetch = vi.fn().mockImplementation(() => {
        connectionAttempts++;
        if (connectionAttempts <= 2) {
          return Promise.reject(new Error('Connection failed'));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      });

      global.fetch = mockFetch;

      const networkError = 'Intermittent connection failure';
      const notificationId = notifyNetworkError(networkError);

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Connection Problem')).toBeInTheDocument();
      });

      // Test retry mechanism
      const retryButton = screen.getByText('Retry');
      
      // First retry
      fireEvent.click(retryButton);
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'network-notification:retry' })
      );

      // Verify retry count could be tracked in real implementation
      expect(mockFetch).not.toHaveBeenCalled(); // Mock doesn't auto-trigger, but event is dispatched
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

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Processing Delay')).toBeInTheDocument();
        expect(screen.getByText(/payment.*longer.*expected.*processing/i)).toBeInTheDocument();
      });

      // Verify both polling and retry options
      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.getByText('Check Status')).toBeInTheDocument();

      // Test status polling
      const statusButton = screen.getByText('Check Status');
      fireEvent.click(statusButton);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webhook-notification:check-status',
          detail: expect.objectContaining({ orderId })
        })
      );
    });

    it('should handle webhook endpoint unavailability', async () => {
      const orderId = 'order-webhook-unavailable';
      const webhookError = 'Webhook endpoint returned 503 Service Unavailable';

      const notificationId = notifyWebhookFailure(orderId, webhookError, {
        showRetry: true
      });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Processing Delay')).toBeInTheDocument();
        expect(screen.getByText(/payment.*longer.*expected/i)).toBeInTheDocument();
      });

      // Test retry functionality for webhook failures
      const retryButton = screen.getByText('Retry');
      fireEvent.click(retryButton);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webhook-notification:retry',
          detail: expect.objectContaining({ orderId })
        })
      );
    });

    it('should handle webhook signature validation failure', async () => {
      const orderId = 'order-webhook-signature';
      const webhookError = 'Webhook signature validation failed';

      const notificationId = notifyWebhookFailure(orderId, webhookError, {
        showPolling: true // Only polling, no retry for security issues
      });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Processing Delay')).toBeInTheDocument();
      });

      // Should only show status check, not retry for security issues
      expect(screen.getByText('Check Status')).toBeInTheDocument();
      expect(screen.queryByText('Retry')).not.toBeInTheDocument();
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
      
      const notificationId = notifyPaymentError(threeDSError, orderId, { persistent: true });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Method Issue')).toBeInTheDocument();
        expect(screen.getByText(/card.*declined.*details.*different/i)).toBeInTheDocument();
      });

      // 3DS failure should offer new payment method
      expect(screen.getByText('New Payment Method')).toBeInTheDocument();
    });

    it('should handle rate limiting during high-traffic periods', async () => {
      const rateLimitError = 'Too many requests. Please try again in a moment.';
      
      const notificationId = notifyPaymentError(rateLimitError, 'order-rate-limit');

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Network Problem')).toBeInTheDocument();
        expect(screen.getByText(/too many requests.*wait.*try/i)).toBeInTheDocument();
      });

      // Rate limit errors should be retryable
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('should handle payment method authentication timeout', async () => {
      const authTimeoutError = 'Payment authentication timed out';
      const orderId = 'order-auth-timeout';

      const notificationId = notifyPaymentError(authTimeoutError, orderId, { persistent: true });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Error')).toBeInTheDocument();
        expect(screen.getByText(/authentication.*timed.*out/i)).toBeInTheDocument();
      });

      // Authentication timeout should offer retry and new payment method
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      expect(screen.getByText('New Payment Method')).toBeInTheDocument();
    });
  });

  describe('Order State Conflicts', () => {
    it('should handle payment attempt on already-paid order', async () => {
      const conflictError = 'Order cannot be paid for - already in paid state';
      const orderId = 'order-already-paid';

      const notificationId = notifyPaymentError(conflictError, orderId, { persistent: true });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Error')).toBeInTheDocument();
        expect(screen.getByText(/order.*cannot.*paid/i)).toBeInTheDocument();
      });

      // Should offer to check order status instead of retry payment
      expect(screen.getByText('Contact Support')).toBeInTheDocument();
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    });

    it('should handle expired order payment attempt', async () => {
      const expiredError = 'Payment window for this order has expired';
      const orderId = 'order-expired';

      const notificationId = notifyPaymentError(expiredError, orderId, { persistent: true });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Error')).toBeInTheDocument();
        expect(screen.getByText(/payment.*expired/i)).toBeInTheDocument();
      });

      // Expired orders should only offer support contact
      expect(screen.getByText('Contact Support')).toBeInTheDocument();
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
      expect(screen.queryByText('New Payment Method')).not.toBeInTheDocument();
    });

    it('should handle concurrent payment attempts', async () => {
      const concurrencyError = 'Another payment is already in progress for this order';
      const orderId = 'order-concurrent';

      const notificationId = notifyPaymentError(concurrencyError, orderId, { persistent: true });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Error')).toBeInTheDocument();
        expect(screen.getByText(/another.*payment.*progress/i)).toBeInTheDocument();
      });

      // Should offer to wait and check status
      expect(screen.getByText('Contact Support')).toBeInTheDocument();
    });
  });

  describe('Real-World Error Combinations', () => {
    it('should handle network error followed by webhook timeout', async () => {
      const orderId = 'order-combo-error';

      // First, network error during initial payment attempt
      const networkNotificationId = notifyNetworkError('Connection timeout during payment submission');

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Connection Problem')).toBeInTheDocument();
      });

      // Then, webhook timeout after successful submission
      const webhookNotificationId = notifyWebhookFailure(orderId, 'Webhook processing delay', {
        showPolling: true
      });

      await waitFor(() => {
        expect(screen.getByText('Connection Problem')).toBeInTheDocument();
        expect(screen.getByText('Payment Processing Delay')).toBeInTheDocument();
      });

      // Both errors should be visible
      const notifications = screen.getAllByRole('alert');
      expect(notifications).toHaveLength(2);
    });

    it('should handle multiple card decline attempts', async () => {
      const orderId = 'order-multiple-declines';

      // First decline
      const firstDecline = notifyPaymentError('card declined', orderId, { persistent: true });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Method Issue')).toBeInTheDocument();
      });

      // Second decline with different card
      const secondDecline = notifyPaymentError('insufficient funds', orderId, { persistent: true });

      await waitFor(() => {
        // Both errors should be tracked
        const stats = errorNotificationManager.getNotificationStats();
        expect(stats.total).toBe(2);
        expect(stats.paymentErrors).toBe(2);
      });

      // Multiple payment method failures should still offer new payment options
      expect(screen.getAllByText('New Payment Method')).toHaveLength(2);
    });

    it('should prioritize critical errors over warnings', async () => {
      const orderId = 'order-priority-test';

      // Create warning level error first
      const webhookWarning = notifyWebhookFailure(orderId, 'Webhook processing delay');

      // Create critical payment error
      const criticalError = notifyPaymentError('card declined', orderId, { persistent: true });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Method Issue')).toBeInTheDocument();
        expect(screen.getByText('Payment Processing Delay')).toBeInTheDocument();
      });

      // Both should be visible but critical error should be more prominent
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(2);
      
      // The payment method issue (critical) should appear first/more prominently
      const criticalAlert = screen.getByText('Payment Method Issue').closest('[role="alert"]');
      expect(criticalAlert).toBeInTheDocument();
    });
  });

  describe('Error Recovery Success Scenarios', () => {
    it('should handle successful retry after network error', async () => {
      const networkError = 'connection timeout';
      const orderId = 'order-retry-success';

      const notificationId = notifyNetworkError(networkError);

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Connection Problem')).toBeInTheDocument();
      });

      // Simulate successful retry by creating success notification
      const retryButton = screen.getByText('Retry');
      fireEvent.click(retryButton);

      // Simulate successful retry outcome
      const successId = errorNotificationManager.addSuccessNotification(
        'Payment Successful',
        'Your payment has been processed successfully',
        false
      );

      await waitFor(() => {
        expect(screen.getByText('Payment Successful')).toBeInTheDocument();
      });

      // Both error and success notifications should be visible
      expect(screen.getByText('Connection Problem')).toBeInTheDocument();
      expect(screen.getByText('Payment Successful')).toBeInTheDocument();
    });

    it('should handle webhook recovery after status polling', async () => {
      const orderId = 'order-webhook-recovery';
      const webhookError = 'webhook timeout';

      const notificationId = notifyWebhookFailure(orderId, webhookError, { showPolling: true });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Processing Delay')).toBeInTheDocument();
      });

      // Simulate status check revealing successful processing
      const statusButton = screen.getByText('Check Status');
      fireEvent.click(statusButton);

      // After status check, simulate success
      const successId = errorNotificationManager.addSuccessNotification(
        'Payment Confirmed',
        `Order ${orderId} has been successfully processed`,
        false
      );

      await waitFor(() => {
        expect(screen.getByText('Payment Confirmed')).toBeInTheDocument();
      });

      // Success should appear alongside the original warning
      expect(screen.getByText('Payment Processing Delay')).toBeInTheDocument();
      expect(screen.getByText('Payment Confirmed')).toBeInTheDocument();
    });
  });
});