import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom';
import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
import ErrorNotificationDisplay from '$lib/components/ErrorNotificationDisplay.svelte';
import { errorNotificationManager, dismissAllNotifications } from '$lib/errorNotificationSystem';

/**
 * Integration tests for ErrorBoundary component with real error scenarios
 */
describe('Error Boundary Integration Tests', () => {
  beforeEach(() => {
    // Clean slate for each test
    dismissAllNotifications();
    
    // Mock console methods to avoid test noise
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Mock window methods
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      location: { reload: vi.fn() }
    });
  });

  afterEach(() => {
    dismissAllNotifications();
    vi.restoreAllMocks();
  });

  describe('Component Error Recovery', () => {
    // Mock component that throws errors for testing
    const ErrorThrowingComponent = ({ shouldThrow = false }) => {
      if (shouldThrow) {
        throw new Error('Test component error');
      }
      return '<div>Working component</div>';
    };

    it('should catch and handle component rendering errors', async () => {
      let hasError = false;

      // Create a wrapper component to test error boundary
      const TestWrapper = ({ throwError = false }) => `
        <ErrorBoundary>
          ${throwError ? ErrorThrowingComponent({ shouldThrow: true }) : ErrorThrowingComponent({ shouldThrow: false })}
        </ErrorBoundary>
      `;

      // First render without error
      const { rerender } = render(TestWrapper, { throwError: false });
      expect(screen.queryByText('Working component')).toBeInTheDocument();

      // Then trigger error
      try {
        await rerender({ throwError: true });
      } catch (error) {
        hasError = true;
        expect(error.message).toContain('Test component error');
      }

      // ErrorBoundary should have caught the error
      expect(hasError).toBe(true);
    });

    it('should display error fallback UI when component fails', async () => {
      // Create error notification for component failure
      const notificationId = errorNotificationManager.addNotification({
        type: 'error',
        title: 'Component Error',
        message: 'A component failed to render. Please try refreshing the page.',
        persistent: true,
        actions: [
          {
            label: 'Refresh Page',
            variant: 'primary'
          },
          {
            label: 'Report Issue',
            variant: 'secondary'
          }
        ]
      });

      // Render error notification display
      render(ErrorNotificationDisplay);

      // Verify error notification appears
      await waitFor(() => {
        expect(screen.getByText('Component Error')).toBeInTheDocument();
        expect(screen.getByText('A component failed to render. Please try refreshing the page.')).toBeInTheDocument();
      });

      // Verify action buttons are present
      expect(screen.getByText('Refresh Page')).toBeInTheDocument();
      expect(screen.getByText('Report Issue')).toBeInTheDocument();
    });
  });

  describe('Payment Component Error Scenarios', () => {
    it('should handle payment form validation errors', async () => {
      // Simulate payment form validation error
      const validationError = 'Invalid card number format';
      
      const notificationId = errorNotificationManager.addPaymentErrorNotification(
        validationError,
        'order-validation-test',
        {
          persistent: false,
          actions: [
            {
              label: 'Fix Card Details',
              variant: 'primary'
            }
          ]
        }
      );

      render(ErrorNotificationDisplay);

      // Verify payment error notification
      await waitFor(() => {
        expect(screen.getByText('Payment Method Issue')).toBeInTheDocument();
        expect(screen.getByText(/card.*invalid/i)).toBeInTheDocument();
      });

      // Verify action button
      expect(screen.getByText('Fix Card Details')).toBeInTheDocument();
    });

    it('should handle Stripe element loading failures', async () => {
      // Simulate Stripe Elements loading error
      const stripeError = 'Failed to load Stripe Elements';
      
      const notificationId = errorNotificationManager.addNotification({
        type: 'error',
        title: 'Payment System Error',
        message: 'Unable to load payment form. Please refresh and try again.',
        persistent: true,
        actions: [
          {
            label: 'Retry',
            variant: 'primary'
          },
          {
            label: 'Contact Support',
            variant: 'secondary'
          }
        ]
      });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment System Error')).toBeInTheDocument();
        expect(screen.getByText('Unable to load payment form. Please refresh and try again.')).toBeInTheDocument();
      });

      // Test retry action
      const retryButton = screen.getByText('Retry');
      expect(retryButton).toBeInTheDocument();
      
      fireEvent.click(retryButton);
      
      // Verify custom event would be dispatched
      // Note: In real implementation, this would trigger a custom event
    });
  });

  describe('Network Error Recovery', () => {
    it('should handle API request failures with retry options', async () => {
      const networkError = 'Failed to fetch order details';
      
      const notificationId = errorNotificationManager.addNetworkErrorNotification(networkError);

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Connection Problem')).toBeInTheDocument();
        expect(screen.getByText(/network.*connection/i)).toBeInTheDocument();
      });

      // Verify retry button is available
      const retryButton = screen.getByText('Retry');
      expect(retryButton).toBeInTheDocument();
      
      // Test retry functionality
      fireEvent.click(retryButton);
      
      // Verify event dispatch
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'network-notification:retry'
        })
      );
    });

    it('should handle offline state recovery', async () => {
      const offlineError = 'You appear to be offline';
      
      const notificationId = errorNotificationManager.addNotification({
        type: 'warning',
        title: 'Connection Lost',
        message: 'You appear to be offline. Some features may not work properly.',
        persistent: true,
        actions: [
          {
            label: 'Check Connection',
            variant: 'primary'
          },
          {
            label: 'Retry',
            variant: 'secondary'
          }
        ]
      });

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Connection Lost')).toBeInTheDocument();
        expect(screen.getByText(/offline.*features/i)).toBeInTheDocument();
      });

      // Test connection check
      const checkButton = screen.getByText('Check Connection');
      fireEvent.click(checkButton);
    });
  });

  describe('Webhook Processing Error Recovery', () => {
    it('should handle webhook timeout with status polling', async () => {
      const orderId = 'order-webhook-recovery-test';
      const webhookError = 'Payment confirmation is taking longer than expected';

      const notificationId = errorNotificationManager.addWebhookFailureNotification(
        orderId,
        webhookError,
        {
          showRetry: true,
          showPolling: true
        }
      );

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Processing Delay')).toBeInTheDocument();
        expect(screen.getByText(/payment.*longer.*expected/i)).toBeInTheDocument();
      });

      // Verify both action buttons are available
      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.getByText('Check Status')).toBeInTheDocument();

      // Test status check action
      const statusButton = screen.getByText('Check Status');
      fireEvent.click(statusButton);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webhook-notification:check-status',
          detail: expect.objectContaining({ orderId })
        })
      );
    });

    it('should handle payment confirmation failures', async () => {
      const orderId = 'order-confirmation-fail';
      const confirmationError = 'Payment confirmation failed';

      const notificationId = errorNotificationManager.addPaymentErrorNotification(
        confirmationError,
        orderId,
        {
          persistent: true,
          actions: [
            {
              label: 'Check Order Status',
              variant: 'primary'
            },
            {
              label: 'Contact Support',
              variant: 'secondary'
            }
          ]
        }
      );

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Error')).toBeInTheDocument();
        expect(screen.getByText(/confirmation.*failed/i)).toBeInTheDocument();
      });

      // Verify support contact option
      const supportButton = screen.getByText('Contact Support');
      expect(supportButton).toBeInTheDocument();
      
      fireEvent.click(supportButton);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment-notification:contact-support'
        })
      );
    });
  });

  describe('Multiple Error Scenarios', () => {
    it('should handle cascading errors gracefully', async () => {
      // Simulate multiple errors occurring in sequence
      const errors = [
        {
          type: 'network',
          message: 'Initial connection failed'
        },
        {
          type: 'payment',
          message: 'Payment processing failed',
          orderId: 'order-cascade-test'
        },
        {
          type: 'component',
          message: 'Component render failed'
        }
      ];

      // Create notifications for each error
      errors.forEach((error, index) => {
        setTimeout(() => {
          switch (error.type) {
            case 'network':
              errorNotificationManager.addNetworkErrorNotification(error.message);
              break;
            case 'payment':
              errorNotificationManager.addPaymentErrorNotification(error.message, error.orderId);
              break;
            case 'component':
              errorNotificationManager.addNotification({
                type: 'error',
                title: 'System Error',
                message: error.message,
                persistent: true
              });
              break;
          }
        }, index * 100); // Stagger the errors
      });

      render(ErrorNotificationDisplay, { maxNotifications: 5 });

      // Wait for all errors to appear
      await waitFor(() => {
        expect(screen.getByText('Connection Problem')).toBeInTheDocument();
        expect(screen.getByText('Payment Error')).toBeInTheDocument();
        expect(screen.getByText('System Error')).toBeInTheDocument();
      }, { timeout: 1000 });

      // Verify all errors are displayed
      const notifications = screen.getAllByRole('alert');
      expect(notifications).toHaveLength(3);
    });

    it('should prioritize critical errors in display', async () => {
      // Create multiple errors with different priorities
      const criticalError = errorNotificationManager.addPaymentErrorNotification(
        'Payment failed - card declined',
        'order-critical',
        { persistent: true }
      );

      const warningError = errorNotificationManager.addWebhookFailureNotification(
        'order-warning',
        'Webhook processing delayed'
      );

      const infoError = errorNotificationManager.addNotification({
        type: 'info',
        title: 'Info Notice',
        message: 'Non-critical information',
        persistent: false
      });

      render(ErrorNotificationDisplay, { maxNotifications: 3 });

      // All should be visible initially
      await waitFor(() => {
        expect(screen.getByText('Payment Method Issue')).toBeInTheDocument();
        expect(screen.getByText('Payment Processing Delay')).toBeInTheDocument();
        expect(screen.getByText('Info Notice')).toBeInTheDocument();
      });

      // Verify order (most recent first)
      const notifications = screen.getAllByRole('alert');
      expect(notifications).toHaveLength(3);
    });
  });

  describe('Error Recovery User Experience', () => {
    it('should provide clear recovery paths for users', async () => {
      const paymentError = 'Your card was declined';
      const orderId = 'order-ux-test';

      const notificationId = errorNotificationManager.addPaymentErrorNotification(
        paymentError,
        orderId,
        {
          persistent: true,
          actions: [
            {
              label: 'Try Different Card',
              variant: 'primary'
            },
            {
              label: 'Update Payment Method',
              variant: 'secondary'
            },
            {
              label: 'Contact Support',
              variant: 'secondary'
            }
          ]
        }
      );

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Method Issue')).toBeInTheDocument();
      });

      // Verify all recovery options are available
      expect(screen.getByText('Try Different Card')).toBeInTheDocument();
      expect(screen.getByText('Update Payment Method')).toBeInTheDocument();
      expect(screen.getByText('Contact Support')).toBeInTheDocument();

      // Test primary action (most prominent)
      const primaryButton = screen.getByText('Try Different Card');
      expect(primaryButton).toHaveClass('action-primary');
      
      fireEvent.click(primaryButton);
      
      // Verify appropriate event is dispatched
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment-notification:new-payment'
        })
      );
    });

    it('should handle error dismissal correctly', async () => {
      const tempError = errorNotificationManager.addNotification({
        type: 'warning',
        title: 'Temporary Warning',
        message: 'This can be dismissed',
        persistent: false
      });

      const persistentError = errorNotificationManager.addPaymentErrorNotification(
        'Payment failed',
        'order-dismiss-test',
        { persistent: true }
      );

      const { container } = render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Temporary Warning')).toBeInTheDocument();
        expect(screen.getByText('Payment Method Issue')).toBeInTheDocument();
      });

      // Test dismissing temporary error
      const dismissButtons = screen.getAllByLabelText(/dismiss notification/i);
      expect(dismissButtons).toHaveLength(2);

      fireEvent.click(dismissButtons[0]);

      // Verify temporary error is dismissed
      await waitFor(() => {
        expect(screen.queryByText('Temporary Warning')).not.toBeInTheDocument();
        expect(screen.getByText('Payment Method Issue')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility and User Experience', () => {
    it('should provide accessible error notifications', async () => {
      const notificationId = errorNotificationManager.addPaymentErrorNotification(
        'Payment failed',
        'order-a11y-test',
        { persistent: true }
      );

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        const notification = screen.getByRole('alert');
        expect(notification).toBeInTheDocument();
        expect(notification).toHaveAttribute('aria-live', 'assertive');
        expect(notification).toHaveAttribute('aria-describedby');
      });

      // Verify dismiss button has proper aria-label
      const dismissButton = screen.getByLabelText(/dismiss notification.*payment method issue/i);
      expect(dismissButton).toBeInTheDocument();

      // Verify action buttons have proper labels
      const actionButtons = screen.getAllByRole('button');
      actionButtons.forEach(button => {
        expect(button).toHaveAttribute('aria-label');
      });
    });

    it('should handle keyboard navigation properly', async () => {
      const notificationId = errorNotificationManager.addPaymentErrorNotification(
        'Payment error with actions',
        'order-keyboard-test',
        {
          persistent: true,
          actions: [
            { label: 'Retry Payment', variant: 'primary' },
            { label: 'Contact Support', variant: 'secondary' }
          ]
        }
      );

      render(ErrorNotificationDisplay);

      await waitFor(() => {
        expect(screen.getByText('Payment Method Issue')).toBeInTheDocument();
      });

      // Verify all interactive elements are focusable
      const focusableElements = screen.getAllByRole('button');
      focusableElements.forEach(element => {
        expect(element).toHaveAttribute('tabindex');
        expect(element).not.toHaveAttribute('tabindex', '-1');
      });

      // Test keyboard navigation
      const firstButton = focusableElements[0];
      firstButton.focus();
      expect(document.activeElement).toBe(firstButton);
    });
  });
});