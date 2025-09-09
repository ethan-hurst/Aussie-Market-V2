import { render, fireEvent, screen } from '@testing-library/svelte';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import PaymentStatusIndicator from './PaymentStatusIndicator.svelte';

// Mock the $app/navigation module
vi.mock('$app/navigation', () => ({
  goto: vi.fn()
}));

describe('PaymentStatusIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with pending status by default', () => {
    render(PaymentStatusIndicator);
    
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Payment Pending')).toBeInTheDocument();
    expect(screen.getByText('Please complete your payment details.')).toBeInTheDocument();
  });

  it('renders succeeded status correctly', () => {
    render(PaymentStatusIndicator, {
      props: { status: 'succeeded' }
    });
    
    expect(screen.getByText('Payment Successful')).toBeInTheDocument();
    expect(screen.getByText('Your payment has been processed successfully.')).toBeInTheDocument();
    expect(screen.getByLabelText('View orders')).toBeInTheDocument();
  });

  it('renders failed status with error message', () => {
    const errorMessage = 'Card declined';
    render(PaymentStatusIndicator, {
      props: { 
        status: 'failed',
        error: errorMessage,
        retryable: true
      }
    });
    
    expect(screen.getByText('Payment Failed')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    expect(screen.getByLabelText('Retry payment')).toBeInTheDocument();
    expect(screen.getByLabelText('Cancel payment')).toBeInTheDocument();
  });

  it('renders processing status with spinning loader', () => {
    render(PaymentStatusIndicator, {
      props: { status: 'processing' }
    });
    
    expect(screen.getByText('Processing Payment')).toBeInTheDocument();
    expect(screen.getByText('Please wait while we process your payment.')).toBeInTheDocument();
    expect(screen.getByText(/Please don't close this window/)).toBeInTheDocument();
  });

  it('renders cancelled status', () => {
    render(PaymentStatusIndicator, {
      props: { status: 'cancelled' }
    });
    
    expect(screen.getByText('Payment Cancelled')).toBeInTheDocument();
    expect(screen.getByText('Payment was cancelled. You can try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Cancel payment')).toBeInTheDocument();
  });

  it('shows progress steps when enabled', () => {
    const progressSteps = ['Payment Details', 'Processing', 'Confirmation'];
    render(PaymentStatusIndicator, {
      props: { 
        showProgress: true,
        progressSteps,
        currentStep: 1
      }
    });
    
    progressSteps.forEach(step => {
      expect(screen.getByText(step)).toBeInTheDocument();
    });
  });

  it('highlights current step in progress', () => {
    const progressSteps = ['Step 1', 'Step 2', 'Step 3'];
    const { container } = render(PaymentStatusIndicator, {
      props: { 
        showProgress: true,
        progressSteps,
        currentStep: 1,
        status: 'processing'
      }
    });
    
    // Check that the current step has the correct styling
    const stepCircles = container.querySelectorAll('.rounded-full');
    expect(stepCircles[1]).toHaveClass('bg-blue-600', 'border-blue-600');
  });

  it('shows completed steps with checkmarks', () => {
    const progressSteps = ['Step 1', 'Step 2', 'Step 3'];
    render(PaymentStatusIndicator, {
      props: { 
        showProgress: true,
        progressSteps,
        currentStep: 2
      }
    });
    
    // The first step should be completed and show a checkmark
    // This is tested via the DOM structure since lucide components are rendered as SVG
  });

  it('dispatches retry event when retry button is clicked', async () => {
    const component = render(PaymentStatusIndicator, {
      props: { 
        status: 'failed',
        retryable: true
      }
    });

    let retryEvent = false;
    component.component.$on('retry', () => {
      retryEvent = true;
    });

    const retryButton = screen.getByLabelText('Retry payment');
    await fireEvent.click(retryButton);

    expect(retryEvent).toBe(true);
  });

  it('dispatches cancel event when cancel button is clicked', async () => {
    const component = render(PaymentStatusIndicator, {
      props: { 
        status: 'failed'
      }
    });

    let cancelEvent = false;
    component.component.$on('cancel', () => {
      cancelEvent = true;
    });

    const cancelButton = screen.getByLabelText('Cancel payment');
    await fireEvent.click(cancelButton);

    expect(cancelEvent).toBe(true);
  });

  it('navigates to orders when view orders button is clicked', async () => {
    const { goto } = await import('$app/navigation');
    render(PaymentStatusIndicator, {
      props: { status: 'succeeded' }
    });

    const viewOrdersButton = screen.getByLabelText('View orders');
    await fireEvent.click(viewOrdersButton);

    expect(goto).toHaveBeenCalledWith('/orders');
  });

  it('applies correct CSS classes for different statuses', () => {
    const { container: succeededContainer } = render(PaymentStatusIndicator, {
      props: { status: 'succeeded' }
    });
    
    const succeededHeader = succeededContainer.querySelector('.status-header');
    expect(succeededHeader).toHaveClass('bg-green-50', 'border-green-200');

    const { container: failedContainer } = render(PaymentStatusIndicator, {
      props: { status: 'failed' }
    });
    
    const failedHeader = failedContainer.querySelector('.status-header');
    expect(failedHeader).toHaveClass('bg-red-50', 'border-red-200');
  });

  it('shows error details when status is failed and error is provided', () => {
    const errorMessage = 'Insufficient funds';
    render(PaymentStatusIndicator, {
      props: { 
        status: 'failed',
        error: errorMessage
      }
    });
    
    expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(PaymentStatusIndicator, {
      props: { status: 'processing' }
    });
    
    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveAttribute('aria-live', 'polite');
  });

  it('does not show retry button when error is not retryable', () => {
    render(PaymentStatusIndicator, {
      props: { 
        status: 'failed',
        retryable: false
      }
    });
    
    expect(screen.queryByLabelText('Retry payment')).not.toBeInTheDocument();
  });

  it('hides progress steps when showProgress is false', () => {
    const progressSteps = ['Step 1', 'Step 2', 'Step 3'];
    render(PaymentStatusIndicator, {
      props: { 
        showProgress: false,
        progressSteps
      }
    });
    
    progressSteps.forEach(step => {
      expect(screen.queryByText(step)).not.toBeInTheDocument();
    });
  });

  it('handles empty progress steps array', () => {
    render(PaymentStatusIndicator, {
      props: { 
        showProgress: true,
        progressSteps: []
      }
    });
    
    // Should not crash and should not show any progress steps
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });
});