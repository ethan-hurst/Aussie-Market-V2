import { writable, derived, get } from 'svelte/store';
import { mapApiErrorToMessage, categorizePaymentError, type PaymentErrorInfo } from './errors';

export interface ErrorNotification {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  persistent: boolean;
  actions?: ErrorNotificationAction[];
  metadata?: Record<string, any>;
}

export interface ErrorNotificationAction {
  label: string;
  action?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface PaymentErrorNotification extends ErrorNotification {
  type: 'error' | 'warning';
  paymentInfo: PaymentErrorInfo;
  orderId?: string;
  retryable: boolean;
}

// Store for managing error notifications
const errorNotifications = writable<ErrorNotification[]>([]);

// Derived store for payment-specific errors
export const paymentErrorNotifications = derived(
  errorNotifications,
  ($notifications) => $notifications.filter(
    (notification): notification is PaymentErrorNotification => 
      'paymentInfo' in notification
  )
);

// Derived store for active (non-dismissed) notifications
export const activeErrorNotifications = derived(
  errorNotifications,
  ($notifications) => $notifications.filter(n => n.persistent || Date.now() - n.timestamp.getTime() < 30000) // Persistent notifications always included, non-persistent auto-dismiss after 30 seconds
);

class ErrorNotificationManager {
  private notificationId = 0;

  /**
   * Add a new error notification
   */
  addNotification(notification: Omit<ErrorNotification, 'id' | 'timestamp'>): string {
    const id = `error-${++this.notificationId}-${Date.now()}`;
    const fullNotification: ErrorNotification = {
      ...notification,
      id,
      timestamp: new Date()
    };

    errorNotifications.update(notifications => [...notifications, fullNotification]);

    // Auto-dismiss non-persistent notifications after 10 seconds
    if (!notification.persistent) {
      setTimeout(() => {
        this.dismissNotification(id);
      }, 10000);
    }

    return id;
  }

  /**
   * Add a payment-specific error notification
   */
  addPaymentErrorNotification(
    error: any,
    orderId?: string,
    options: {
      persistent?: boolean;
      actions?: ErrorNotificationAction[];
      metadata?: Record<string, any>;
    } = {}
  ): string {
    const paymentInfo = categorizePaymentError(error);
    
    const notification: PaymentErrorNotification = {
      id: '', // Will be set by addNotification
      type: paymentInfo.type === 'card_error' ? 'warning' : 'error',
      title: this.getPaymentErrorTitle(paymentInfo),
      message: paymentInfo.userMessage,
      timestamp: new Date(),
      persistent: options.persistent ?? false,
      actions: options.actions ?? this.getDefaultPaymentErrorActions(paymentInfo, orderId),
      metadata: options.metadata,
      paymentInfo,
      orderId,
      retryable: paymentInfo.canRetry
    };

    return this.addNotification(notification);
  }

  /**
   * Dismiss a specific notification
   */
  dismissNotification(id: string): void {
    errorNotifications.update(notifications => 
      notifications.filter(n => n.id !== id)
    );
  }

  /**
   * Dismiss all notifications
   */
  dismissAllNotifications(): void {
    errorNotifications.set([]);
  }

  /**
   * Dismiss all payment error notifications
   */
  dismissPaymentErrorNotifications(): void {
    errorNotifications.update(notifications => 
      notifications.filter(n => !('paymentInfo' in n))
    );
  }

  /**
   * Get payment error title based on error type
   */
  private getPaymentErrorTitle(paymentInfo: PaymentErrorInfo): string {
    switch (paymentInfo.type) {
      case 'card_error':
        return 'Payment Method Issue';
      case 'network_error':
        return 'Connection Problem';
      case 'webhook_error':
        return 'Payment Processing Delay';
      case 'processing_error':
        return 'Payment Processing Issue';
      default:
        return 'Payment Error';
    }
  }

  /**
   * Get default actions for payment error notifications
   */
  private getDefaultPaymentErrorActions(
    paymentInfo: PaymentErrorInfo, 
    orderId?: string
  ): ErrorNotificationAction[] {
    const actions: ErrorNotificationAction[] = [];

    if (paymentInfo.canRetry) {
      actions.push({
        label: 'Try Again',
        action: () => {
          // Dispatch CustomEvent for parent components to handle
          window.dispatchEvent(new CustomEvent('payment-notification:retry', {
            detail: { orderId, paymentInfo }
          }));
        },
        variant: 'primary'
      });
    }

    if (paymentInfo.requiresNewPayment) {
      actions.push({
        label: 'New Payment Method',
        action: () => {
          // Dispatch CustomEvent for parent components to handle
          window.dispatchEvent(new CustomEvent('payment-notification:new-payment', {
            detail: { orderId, paymentInfo }
          }));
        },
        variant: 'secondary'
      });
    }

    if (paymentInfo.shouldContactSupport) {
      actions.push({
        label: 'Contact Support',
        action: () => {
          // Dispatch CustomEvent for parent components to handle
          window.dispatchEvent(new CustomEvent('payment-notification:contact-support', {
            detail: { orderId, paymentInfo }
          }));
        },
        variant: 'secondary'
      });
    }

    return actions;
  }

  /**
   * Add a webhook failure notification with enhanced timeout detection
   */
  addWebhookFailureNotification(
    orderId: string,
    error: any,
    options: {
      showRetry?: boolean;
      showPolling?: boolean;
      isTimeout?: boolean;
      isNetworkError?: boolean;
    } = {}
  ): string {
    const message = mapApiErrorToMessage(error);
    const actions: ErrorNotificationAction[] = [];
    
    // Detect timeout scenarios
    const isTimeout = options.isTimeout || 
      (error && (error.isTimeout || error.code === 'TIMEOUT')) ||
      message.toLowerCase().includes('timeout') ||
      message.toLowerCase().includes('took too long');
    
    // Detect network errors
    const isNetworkError = options.isNetworkError || 
      (error && (error.isNetworkError || error.code === 'NETWORK_ERROR')) ||
      message.toLowerCase().includes('network') ||
      message.toLowerCase().includes('connection');

    // Enhanced title and message based on error type
    let title = 'Payment Processing Delay';
    let enhancedMessage = message;
    
    if (isTimeout) {
      title = 'Webhook Timeout';
      enhancedMessage = `Webhook processing for order ${orderId} timed out. ${message}`;
    } else if (isNetworkError) {
      title = 'Network Error During Processing';
      enhancedMessage = `Network error occurred while processing order ${orderId}. ${message}`;
    } else {
      enhancedMessage = `Your payment for order ${orderId} is taking longer than expected. ${message}`;
    }

    if (options.showRetry) {
      actions.push({
        label: 'Retry',
        action: () => {
          // Dispatch CustomEvent for parent components to handle
          window.dispatchEvent(new CustomEvent('webhook-notification:retry', {
            detail: { orderId, error, isTimeout, isNetworkError }
          }));
        },
        variant: 'primary'
      });
    }

    if (options.showPolling) {
      actions.push({
        label: 'Check Status',
        action: () => {
          // Dispatch CustomEvent for parent components to handle
          window.dispatchEvent(new CustomEvent('webhook-notification:check-status', {
            detail: { orderId, error, isTimeout, isNetworkError }
          }));
        },
        variant: 'secondary'
      });
    }

    return this.addNotification({
      type: isTimeout || isNetworkError ? 'error' : 'warning',
      title,
      message: enhancedMessage,
      persistent: true,
      actions,
      metadata: { 
        orderId, 
        errorType: 'webhook_failure',
        isTimeout,
        isNetworkError,
        originalError: error
      }
    });
  }

  /**
   * Add a network connectivity notification with enhanced detection
   */
  addNetworkErrorNotification(
    error: any,
    options: {
      isRetryable?: boolean;
      showPolling?: boolean;
      context?: string;
    } = {}
  ): string {
    const { isRetryable = true, showPolling = false, context = '' } = options;
    
    // Detect specific network error types
    const isNetworkChange = error && (error.isNetworkChange || error.code === 'NETWORK_CHANGE');
    const isTimeout = error && (error.isTimeout || error.code === 'TIMEOUT');
    const isConnectionLost = error && (error.isNetworkError || error.code === 'NETWORK_ERROR');
    
    let title = 'Connection Problem';
    let message = mapApiErrorToMessage(error);
    
    if (isNetworkChange) {
      title = 'Network Conditions Changed';
      message = 'Network connectivity changed during the request. Please try again.';
    } else if (isTimeout) {
      title = 'Request Timeout';
      message = 'The request took too long to complete. Please check your connection and try again.';
    } else if (isConnectionLost) {
      title = 'Connection Lost';
      message = 'Lost connection to the server. Please check your network and try again.';
    }
    
    if (context) {
      message = `${context}: ${message}`;
    }
    
    const actions: ErrorNotificationAction[] = [];
    
    if (isRetryable) {
      actions.push({
        label: 'Retry',
        action: () => {
          // Dispatch CustomEvent for parent components to handle
          window.dispatchEvent(new CustomEvent('network-notification:retry', {
            detail: { 
              error, 
              isNetworkChange, 
              isTimeout, 
              isConnectionLost,
              context
            }
          }));
        },
        variant: 'primary'
      });
    }
    
    if (showPolling) {
      actions.push({
        label: 'Monitor Status',
        action: () => {
          window.dispatchEvent(new CustomEvent('network-notification:monitor', {
            detail: { error, context }
          }));
        },
        variant: 'secondary'
      });
    }

    return this.addNotification({
      type: 'error',
      title,
      message,
      persistent: isNetworkChange || isConnectionLost, // More persistent for serious network issues
      actions,
      metadata: { 
        errorType: 'network',
        isNetworkChange,
        isTimeout,
        isConnectionLost,
        context,
        originalError: error
      }
    });
  }

  /**
   * Add a success notification
   */
  addSuccessNotification(title: string, message: string, persistent: boolean = false): string {
    return this.addNotification({
      type: 'success',
      title,
      message,
      persistent
    });
  }

  /**
   * Get notification statistics
   */
  getNotificationStats(): {
    total: number;
    byType: Record<string, number>;
    paymentErrors: number;
    persistent: number;
  } {
    // Get current notifications synchronously using Svelte's get() function
    const notifications = get(errorNotifications);
    
    const stats = {
      total: notifications.length,
      byType: {} as Record<string, number>,
      paymentErrors: 0,
      persistent: 0
    };

    notifications.forEach(notification => {
      stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
      
      if ('paymentInfo' in notification) {
        stats.paymentErrors++;
      }
      
      if (notification.persistent) {
        stats.persistent++;
      }
    });

    return stats;
  }
}

// Export singleton instance
export const errorNotificationManager = new ErrorNotificationManager();

// Export stores for reactive components
export { errorNotifications };

/**
 * Convenience functions for common error notifications
 */
export const notifyPaymentError = (
  error: any, 
  orderId?: string, 
  options?: { persistent?: boolean; actions?: ErrorNotificationAction[] }
) => errorNotificationManager.addPaymentErrorNotification(error, orderId, options);

export const notifyWebhookFailure = (
  orderId: string, 
  error: any, 
  options?: { 
    showRetry?: boolean; 
    showPolling?: boolean;
    isTimeout?: boolean;
    isNetworkError?: boolean;
  }
) => errorNotificationManager.addWebhookFailureNotification(orderId, error, options);

export const notifyNetworkError = (
  error: any, 
  options?: {
    isRetryable?: boolean;
    showPolling?: boolean;
    context?: string;
  }
) => errorNotificationManager.addNetworkErrorNotification(error, options);

export const notifySuccess = (title: string, message: string, persistent?: boolean) => 
  errorNotificationManager.addSuccessNotification(title, message, persistent);

export const dismissNotification = (id: string) => errorNotificationManager.dismissNotification(id);

export const dismissAllNotifications = () => errorNotificationManager.dismissAllNotifications();
