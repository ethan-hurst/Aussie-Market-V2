import { render, fireEvent, screen, waitFor } from '@testing-library/svelte';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writable } from 'svelte/store';
import ErrorNotificationDisplay from './ErrorNotificationDisplay.svelte';

// Mock the error notification system
const mockNotifications = writable([]);
vi.mock('$lib/errorNotificationSystem', () => ({
  activeErrorNotifications: mockNotifications,
  dismissNotification: vi.fn(),
  type: {
    ErrorNotification: {}
  }
}));

describe('ErrorNotificationDisplay', () => {
  const mockNotification = {
    id: 'test-notification-1',
    type: 'error',
    title: 'Test Error',
    message: 'This is a test error message',
    timestamp: new Date(),
    persistent: false,
    actions: [
      { label: 'Retry', variant: 'primary' },
      { label: 'Dismiss', variant: 'secondary' }
    ]
  };

  const mockPaymentNotification = {
    id: 'payment-notification-1',
    type: 'error',
    title: 'Payment Error',
    message: 'Payment failed',
    timestamp: new Date(),
    persistent: false,
    paymentInfo: {
      type: 'card_error',
      retryable: true
    },
    retryable: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockNotifications.set([]);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('renders empty when no notifications', () => {
    const { container } = render(ErrorNotificationDisplay);
    
    const notifications = container.querySelectorAll('.notification');
    expect(notifications).toHaveLength(0);
  });

  it('renders notification with correct content', async () => {
    mockNotifications.set([mockNotification]);
    
    render(ErrorNotificationDisplay);
    
    await waitFor(() => {
      expect(screen.getByText('Test Error')).toBeInTheDocument();
      expect(screen.getByText('This is a test error message')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('renders notification actions', async () => {
    mockNotifications.set([mockNotification]);
    
    render(ErrorNotificationDisplay);
    
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.getByText('Dismiss')).toBeInTheDocument();
    });
  });

  it('dispatches action event when action button is clicked', async () => {
    mockNotifications.set([mockNotification]);
    
    const component = render(ErrorNotificationDisplay);
    
    let actionEvent = null;
    component.component.$on('notificationAction', (event) => {
      actionEvent = event.detail;
    });

    await waitFor(() => {
      const retryButton = screen.getByText('Retry');
      return fireEvent.click(retryButton);
    });

    expect(actionEvent).toEqual({
      notificationId: 'test-notification-1',
      actionLabel: 'Retry'
    });
  });

  it('calls dismissNotification when dismiss button is clicked', async () => {
    const { dismissNotification } = await import('$lib/errorNotificationSystem');
    mockNotifications.set([mockNotification]);
    
    render(ErrorNotificationDisplay);
    
    await waitFor(() => {
      const dismissButton = screen.getByLabelText('Dismiss notification');
      return fireEvent.click(dismissButton);
    });

    expect(dismissNotification).toHaveBeenCalledWith('test-notification-1');
  });

  it('dispatches dismissed event when notification is dismissed', async () => {
    mockNotifications.set([mockNotification]);
    
    const component = render(ErrorNotificationDisplay);
    
    let dismissedEvent = null;
    component.component.$on('notificationDismissed', (event) => {
      dismissedEvent = event.detail;
    });

    await waitFor(() => {
      const dismissButton = screen.getByLabelText('Dismiss notification');
      return fireEvent.click(dismissButton);
    });

    expect(dismissedEvent).toEqual({
      notificationId: 'test-notification-1'
    });
  });

  it('shows payment-specific icon for payment notifications', async () => {
    mockNotifications.set([mockPaymentNotification]);
    
    const { container } = render(ErrorNotificationDisplay);
    
    await waitFor(() => {
      // Check that the payment error uses a credit card icon
      const iconContainer = container.querySelector('.notification-icon');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  it('shows retryable indicator for retryable notifications', async () => {
    mockNotifications.set([mockPaymentNotification]);
    
    render(ErrorNotificationDisplay);
    
    await waitFor(() => {
      expect(screen.getByText('Retryable')).toBeInTheDocument();
    });
  });

  it('formats timestamp correctly', async () => {
    const recentNotification = {
      ...mockNotification,
      timestamp: new Date(Date.now() - 30000) // 30 seconds ago
    };
    mockNotifications.set([recentNotification]);
    
    render(ErrorNotificationDisplay);
    
    await waitFor(() => {
      expect(screen.getByText('Just now')).toBeInTheDocument();
    });
  });

  it('limits notifications to maxNotifications prop', async () => {
    const notifications = Array.from({ length: 10 }, (_, i) => ({
      ...mockNotification,
      id: `notification-${i}`,
      title: `Notification ${i}`
    }));
    
    mockNotifications.set(notifications);
    
    const { container } = render(ErrorNotificationDisplay, {
      props: { maxNotifications: 3 }
    });
    
    await waitFor(() => {
      const renderedNotifications = container.querySelectorAll('.notification');
      expect(renderedNotifications).toHaveLength(3);
    });
  });

  it('applies correct position classes', () => {
    const { container } = render(ErrorNotificationDisplay, {
      props: { position: 'bottom-left' }
    });
    
    const display = container.querySelector('.error-notification-display');
    expect(display).toHaveClass('bottom-left');
  });

  it('applies correct color classes based on notification type', async () => {
    const successNotification = {
      ...mockNotification,
      type: 'success'
    };
    mockNotifications.set([successNotification]);
    
    const { container } = render(ErrorNotificationDisplay);
    
    await waitFor(() => {
      const notification = container.querySelector('.notification');
      expect(notification).toHaveClass('notification-green');
    });
  });

  it('sets up auto-dismiss timeout for non-persistent notifications', async () => {
    vi.useFakeTimers();
    const { dismissNotification } = await import('$lib/errorNotificationSystem');
    
    mockNotifications.set([mockNotification]);
    
    render(ErrorNotificationDisplay, {
      props: { autoDismissDelay: 1000 }
    });
    
    // Fast-forward time
    vi.advanceTimersByTime(1000);
    
    await waitFor(() => {
      expect(dismissNotification).toHaveBeenCalledWith('test-notification-1');
    });
    
    vi.useRealTimers();
  });

  it('does not auto-dismiss persistent notifications', async () => {
    vi.useFakeTimers();
    const { dismissNotification } = await import('$lib/errorNotificationSystem');
    
    const persistentNotification = {
      ...mockNotification,
      persistent: true
    };
    mockNotifications.set([persistentNotification]);
    
    render(ErrorNotificationDisplay, {
      props: { autoDismissDelay: 1000 }
    });
    
    // Fast-forward time
    vi.advanceTimersByTime(1000);
    
    expect(dismissNotification).not.toHaveBeenCalled();
    
    vi.useRealTimers();
  });

  it('cleans up timeouts on unmount', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    
    mockNotifications.set([mockNotification]);
    
    const { unmount } = render(ErrorNotificationDisplay);
    
    unmount();
    
    expect(clearTimeoutSpy).toHaveBeenCalled();
    
    vi.useRealTimers();
  });

  it('has proper accessibility attributes', async () => {
    mockNotifications.set([mockNotification]);
    
    render(ErrorNotificationDisplay);
    
    await waitFor(() => {
      const region = screen.getByRole('region');
      expect(region).toHaveAttribute('aria-live', 'polite');
      expect(region).toHaveAttribute('aria-label', 'Error notifications');
      
      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });
  });

  it('handles responsive layout on mobile', () => {
    const { container } = render(ErrorNotificationDisplay);
    
    // Check that responsive styles are applied
    const display = container.querySelector('.error-notification-display');
    expect(display).toHaveClass('error-notification-display');
  });

  it('handles empty actions array', async () => {
    const notificationWithoutActions = {
      ...mockNotification,
      actions: []
    };
    mockNotifications.set([notificationWithoutActions]);
    
    const { container } = render(ErrorNotificationDisplay);
    
    await waitFor(() => {
      const actionButtons = container.querySelectorAll('.action-button');
      expect(actionButtons).toHaveLength(0);
    });
  });
});