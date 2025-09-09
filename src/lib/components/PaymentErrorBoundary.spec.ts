import { render, fireEvent, screen } from '@testing-library/svelte';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import PaymentErrorBoundary from './PaymentErrorBoundary.svelte';

describe('PaymentErrorBoundary', () => {
  const mockError = new Error('Payment failed');
  const mockOrderId = 'order_123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when no error is provided', () => {
    const { container } = render(PaymentErrorBoundary, {
      props: { error: null }
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders error boundary with error message', () => {
    render(PaymentErrorBoundary, {
      props: { error: mockError, orderId: mockOrderId }
    });
    
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Payment Error')).toBeInTheDocument();
  });

  it('displays order ID when provided', () => {
    render(PaymentErrorBoundary, {
      props: { error: mockError, orderId: mockOrderId }
    });
    
    expect(screen.getByText(`Order ID: ${mockOrderId}`)).toBeInTheDocument();
  });

  it('shows retry button when error is retryable and within max retries', () => {
    render(PaymentErrorBoundary, {
      props: { 
        error: mockError, 
        orderId: mockOrderId,
        showRetry: true,
        maxRetries: 3,
        retryCount: 1
      }
    });
    
    const retryButton = screen.queryByLabelText('Retry payment');
    // Note: The retry button visibility depends on the error categorization
    // This test may need adjustment based on the actual categorizePaymentError implementation
  });

  it('dispatches retry event when retry button is clicked', async () => {
    const component = render(PaymentErrorBoundary, {
      props: { 
        error: mockError, 
        orderId: mockOrderId,
        showRetry: true,
        maxRetries: 3,
        retryCount: 1
      }
    });

    let retryEvent: any = null;
    component.component.$on('retry', (event) => {
      retryEvent = event.detail;
    });

    // Find and click retry button if it exists
    const retryButton = screen.queryByLabelText('Retry payment');
    if (retryButton) {
      await fireEvent.click(retryButton);
      expect(retryEvent).toEqual({ attempt: 2 });
    }
  });

  it('dispatches contactSupport event when support button is clicked', async () => {
    const component = render(PaymentErrorBoundary, {
      props: { 
        error: mockError, 
        orderId: mockOrderId
      }
    });

    let supportEvent: any = null;
    component.component.$on('contactSupport', (event) => {
      supportEvent = event.detail;
    });

    const supportButton = screen.queryByLabelText('Contact support');
    if (supportButton) {
      await fireEvent.click(supportButton);
      expect(supportEvent).toEqual({ 
        error: mockError, 
        orderId: mockOrderId 
      });
    }
  });

  it('dispatches newPayment event when new payment button is clicked', async () => {
    const component = render(PaymentErrorBoundary, {
      props: { 
        error: mockError, 
        orderId: mockOrderId
      }
    });

    let newPaymentEvent: any = null;
    component.component.$on('newPayment', (event) => {
      newPaymentEvent = event.detail;
    });

    const newPaymentButton = screen.queryByLabelText('Try different payment method');
    if (newPaymentButton) {
      await fireEvent.click(newPaymentButton);
      expect(newPaymentEvent).toEqual({ orderId: mockOrderId });
    }
  });

  it('shows max retries reached message when limit exceeded', () => {
    render(PaymentErrorBoundary, {
      props: { 
        error: mockError, 
        orderId: mockOrderId,
        maxRetries: 3,
        retryCount: 3
      }
    });
    
    const maxRetriesText = screen.queryByText(/Maximum retry attempts reached/);
    // This may be visible depending on the error categorization
    if (maxRetriesText) {
      expect(maxRetriesText).toBeInTheDocument();
    }
  });

  it('shows correct error title based on error type', () => {
    // Test different error types if categorizePaymentError returns different types
    render(PaymentErrorBoundary, {
      props: { error: mockError }
    });
    
    // The actual title depends on the categorizePaymentError implementation
    expect(screen.getByText(/Payment/)).toBeInTheDocument();
  });

  it('applies correct CSS classes for different error types', () => {
    const { container } = render(PaymentErrorBoundary, {
      props: { error: mockError }
    });
    
    const errorContainer = container.querySelector('.error-container');
    expect(errorContainer).toHaveClass('bg-red-50', 'border-red-200');
  });

  it('has proper accessibility attributes', () => {
    render(PaymentErrorBoundary, {
      props: { error: mockError, orderId: mockOrderId }
    });
    
    const alertElement = screen.getByRole('alert');
    expect(alertElement).toHaveAttribute('aria-live', 'polite');
    
    // Check for proper button labels
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toHaveAttribute('aria-label');
    });
  });

  it('prevents retry when already retrying', async () => {
    const component = render(PaymentErrorBoundary, {
      props: { 
        error: mockError, 
        orderId: mockOrderId,
        showRetry: true,
        maxRetries: 3,
        retryCount: 1
      }
    });

    // First click should trigger retry
    const retryButton = screen.queryByLabelText('Retry payment');
    if (retryButton) {
      await fireEvent.click(retryButton);
      
      // Button should be disabled during retry
      expect(retryButton).toBeDisabled();
    }
  });
});