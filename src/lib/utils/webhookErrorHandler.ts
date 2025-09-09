import { notifyWebhookFailure, notifyNetworkError } from '../errorNotificationSystem';
import { retryWebhookOperation } from './networkAwareRetry';
import { webhookFallbackManager } from '../webhookFallback';

/**
 * Enhanced webhook error handler that provides comprehensive error detection,
 * notification, and recovery mechanisms for webhook timeout and network issues
 */
export class WebhookErrorHandler {
  private static instance: WebhookErrorHandler;
  
  private constructor() {}
  
  static getInstance(): WebhookErrorHandler {
    if (!this.instance) {
      this.instance = new WebhookErrorHandler();
    }
    return this.instance;
  }

  /**
   * Handle webhook timeout errors with comprehensive detection and notification
   */
  async handleWebhookTimeout(
    orderId: string,
    error: any,
    options: {
      enableFallback?: boolean;
      enableRetry?: boolean;
      showNotification?: boolean;
    } = {}
  ): Promise<{
    handled: boolean;
    fallbackStarted: boolean;
    retryAttempted: boolean;
    error?: Error;
  }> {
    const {
      enableFallback = true,
      enableRetry = true,
      showNotification = true
    } = options;

    // Enhanced timeout detection
    const isTimeout = this.isWebhookTimeout(error);
    const isNetworkError = this.isNetworkError(error);
    
    console.log(`Handling webhook error for order ${orderId}:`, {
      isTimeout,
      isNetworkError,
      error: error?.message || error
    });

    let fallbackStarted = false;
    let retryAttempted = false;

    try {
      // Show appropriate notification
      if (showNotification) {
        if (isTimeout) {
          notifyWebhookFailure(orderId, error, {
            showRetry: enableRetry,
            showPolling: enableFallback,
            isTimeout: true
          });
        } else if (isNetworkError) {
          notifyNetworkError(error, {
            context: `Webhook processing for order ${orderId}`,
            showPolling: enableFallback,
            isRetryable: enableRetry
          });
        } else {
          // Generic webhook failure
          notifyWebhookFailure(orderId, error, {
            showRetry: enableRetry,
            showPolling: enableFallback
          });
        }
      }

      // Start fallback polling if enabled
      if (enableFallback) {
        try {
          fallbackStarted = true;
          console.log(`Starting webhook fallback polling for order ${orderId}`);
          
          // Start polling with enhanced error handling
          webhookFallbackManager.startPolling(orderId, {
            maxPollingAttempts: isTimeout ? 15 : 10, // More attempts for timeouts
            pollingInterval: isNetworkError ? 3000 : 2000, // Longer intervals for network errors
            maxTotalDuration: 600000, // 10 minutes
            exponentialBackoff: true,
            onError: (pollingError) => {
              console.error(`Polling error for order ${orderId}:`, pollingError);
              
              // Additional error notification for polling failures
              if (this.isWebhookTimeout(pollingError)) {
                notifyWebhookFailure(orderId, pollingError, {
                  showRetry: false,
                  isTimeout: true
                });
              } else if (this.isNetworkError(pollingError)) {
                notifyNetworkError(pollingError, {
                  context: `Fallback polling for order ${orderId}`,
                  isRetryable: false
                });
              }
            },
            onStatusUpdate: (order) => {
              console.log(`Order ${orderId} status updated via fallback:`, order.state);
            },
            onComplete: (finalOrder) => {
              console.log(`Order ${orderId} fallback polling completed:`, finalOrder.state);
            }
          });
        } catch (fallbackError) {
          console.error(`Failed to start fallback polling for order ${orderId}:`, fallbackError);
          
          if (showNotification) {
            notifyWebhookFailure(orderId, fallbackError, {
              showRetry: false,
              showPolling: false
            });
          }
        }
      }

      return {
        handled: true,
        fallbackStarted,
        retryAttempted,
      };

    } catch (handlingError) {
      console.error(`Error handling webhook failure for order ${orderId}:`, handlingError);
      
      return {
        handled: false,
        fallbackStarted,
        retryAttempted,
        error: handlingError instanceof Error ? handlingError : new Error(String(handlingError))
      };
    }
  }

  /**
   * Handle network errors during webhook processing
   */
  async handleNetworkError(
    error: any,
    options: {
      context?: string;
      enableRetry?: boolean;
      showNotification?: boolean;
      orderId?: string;
    } = {}
  ): Promise<{
    handled: boolean;
    shouldRetry: boolean;
    error?: Error;
  }> {
    const {
      context = 'Webhook operation',
      enableRetry = true,
      showNotification = true,
      orderId
    } = options;

    try {
      const isNetworkError = this.isNetworkError(error);
      const isNetworkChange = this.isNetworkChange(error);
      const isTimeout = this.isWebhookTimeout(error);

      console.log(`Handling network error in ${context}:`, {
        isNetworkError,
        isNetworkChange,
        isTimeout,
        error: error?.message || error
      });

      if (showNotification) {
        if (orderId && isTimeout) {
          notifyWebhookFailure(orderId, error, {
            showRetry: enableRetry,
            showPolling: true,
            isTimeout: true,
            isNetworkError: isNetworkError || isNetworkChange
          });
        } else {
          notifyNetworkError(error, {
            context,
            isRetryable: enableRetry,
            showPolling: !!orderId
          });
        }
      }

      // Determine if we should retry
      const shouldRetry = enableRetry && (isNetworkError || isNetworkChange || isTimeout);

      return {
        handled: true,
        shouldRetry
      };

    } catch (handlingError) {
      console.error(`Error handling network error in ${context}:`, handlingError);
      
      return {
        handled: false,
        shouldRetry: false,
        error: handlingError instanceof Error ? handlingError : new Error(String(handlingError))
      };
    }
  }

  /**
   * Execute webhook operation with comprehensive error handling
   */
  async executeWebhookOperation<T>(
    operation: () => Promise<T>,
    orderId: string,
    options: {
      maxRetries?: number;
      enableFallback?: boolean;
      showNotifications?: boolean;
      context?: string;
    } = {}
  ): Promise<{
    success: boolean;
    result?: T;
    error?: Error;
    attempts: number;
    fallbackStarted: boolean;
  }> {
    const {
      maxRetries = 3,
      enableFallback = true,
      showNotifications = true,
      context = `Webhook operation for order ${orderId}`
    } = options;

    let fallbackStarted = false;

    try {
      // Use network-aware retry for the operation
      const retryResult = await retryWebhookOperation(operation, orderId, {
        maxRetries,
        context,
        onRetry: (attempt, delay, error) => {
          console.log(`${context} retry attempt ${attempt} after ${delay}ms delay:`, error);
          
          if (showNotifications) {
            this.handleNetworkError(error, {
              context,
              enableRetry: attempt <= maxRetries,
              showNotification: true,
              orderId
            });
          }
        }
      });

      if (retryResult.success && retryResult.result !== undefined) {
        return {
          success: true,
          result: retryResult.result,
          attempts: retryResult.attempts,
          fallbackStarted
        };
      }

      // Operation failed after retries, handle with fallback
      if (retryResult.error && enableFallback) {
        const handlingResult = await this.handleWebhookTimeout(orderId, retryResult.error, {
          enableFallback: true,
          enableRetry: false, // Already retried
          showNotification: showNotifications
        });
        
        fallbackStarted = handlingResult.fallbackStarted;
      }

      return {
        success: false,
        error: retryResult.error,
        attempts: retryResult.attempts,
        fallbackStarted
      };

    } catch (error) {
      console.error(`${context} execution failed:`, error);
      
      const executionError = error instanceof Error ? error : new Error(String(error));
      
      // Try to handle as webhook timeout
      if (enableFallback) {
        const handlingResult = await this.handleWebhookTimeout(orderId, executionError, {
          enableFallback: true,
          enableRetry: false,
          showNotification: showNotifications
        });
        
        fallbackStarted = handlingResult.fallbackStarted;
      }

      return {
        success: false,
        error: executionError,
        attempts: 1,
        fallbackStarted
      };
    }
  }

  /**
   * Enhanced webhook timeout detection
   */
  private isWebhookTimeout(error: any): boolean {
    if (!error) return false;
    
    // Direct timeout indicators
    if (error.isTimeout || error.code === 'TIMEOUT') return true;
    
    const message = (error.message || String(error)).toLowerCase();
    
    // Webhook-specific timeout patterns
    return message.includes('webhook') && (
      message.includes('timeout') ||
      message.includes('took too long') ||
      message.includes('timed out')
    ) ||
    // General timeout patterns
    message.includes('timeout') ||
    message.includes('took too long') ||
    message.includes('aborted') ||
    message.includes('request timeout');
  }

  /**
   * Network error detection
   */
  private isNetworkError(error: any): boolean {
    if (!error) return false;
    
    if (error.isNetworkError || error.code === 'NETWORK_ERROR') return true;
    
    const message = (error.message || String(error)).toLowerCase();
    return message.includes('network') ||
           message.includes('connection') ||
           message.includes('fetch') ||
           message.includes('err_network') ||
           message.includes('err_internet_disconnected') ||
           message.includes('connection lost') ||
           message.includes('connection failed');
  }

  /**
   * Network change detection
   */
  private isNetworkChange(error: any): boolean {
    if (!error) return false;
    
    return error.isNetworkChange || 
           error.code === 'NETWORK_CHANGE' ||
           (error.message && error.message.includes('network conditions changed'));
  }
}

// Export singleton instance and convenience functions
export const webhookErrorHandler = WebhookErrorHandler.getInstance();

export const handleWebhookTimeout = (orderId: string, error: any, options?: any) =>
  webhookErrorHandler.handleWebhookTimeout(orderId, error, options);

export const handleNetworkError = (error: any, options?: any) =>
  webhookErrorHandler.handleNetworkError(error, options);

export const executeWebhookOperation = <T>(
  operation: () => Promise<T>,
  orderId: string,
  options?: any
) => webhookErrorHandler.executeWebhookOperation(operation, orderId, options);