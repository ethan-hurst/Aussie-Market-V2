import { safeFetch, NetworkMonitor } from './http';
import { mapApiErrorToMessage } from './errors';
import { notifyNetworkError, notifyWebhookFailure } from './errorNotificationSystem';

export interface OrderStatus {
  id: string;
  state: 'pending' | 'pending_payment' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  updated_at: string;
  stripe_payment_intent_id?: string;
}

export interface WebhookFallbackOptions {
  maxPollingAttempts?: number;
  pollingInterval?: number;
  maxTotalDuration?: number;
  exponentialBackoff?: boolean;
  onStatusUpdate?: (status: OrderStatus) => void;
  onError?: (error: Error) => void;
  onComplete?: (finalStatus: OrderStatus) => void;
}

export interface PollingResult {
  success: boolean;
  finalStatus?: OrderStatus;
  error?: string;
  attempts: number;
}

/**
 * Poll for order status updates when webhook fails
 */
export class WebhookFallbackManager {
  private activePollers = new Map<string, number>();
  private pollingAttempts = new Map<string, number>();
  private pollingStartTimes = new Map<string, number>();
  private networkChangeListeners = new Map<string, () => void>();
  
  constructor() {
    // Initialize network monitoring
    NetworkMonitor.initialize();
  }

  /**
   * Start polling for order status updates
   */
  async startPolling(
    orderId: string, 
    options: WebhookFallbackOptions = {}
  ): Promise<PollingResult> {
    const {
      maxPollingAttempts = 10,
      pollingInterval = 2000,
      maxTotalDuration = 300000, // 5 minutes default
      exponentialBackoff = true,
      onStatusUpdate,
      onError,
      onComplete
    } = options;

    // Clear any existing poller for this order
    this.stopPolling(orderId);

    return new Promise((resolve) => {
      let attempts = 0;
      let currentInterval = pollingInterval;
      const startTime = Date.now();
      this.pollingStartTimes.set(orderId, startTime);
      
      // Set up network change monitoring for this polling session
      const networkChangeCleanup = NetworkMonitor.onNetworkChange((isOnline) => {
        if (!isOnline) {
          // Network lost during polling
          console.log(`Network lost during polling for order ${orderId}`);
          notifyNetworkError(
            new Error('Network connection lost during webhook fallback polling'),
            { context: `Order ${orderId} status polling`, showPolling: true }
          );
        } else {
          // Network restored - adjust retry strategy
          console.log(`Network restored during polling for order ${orderId} - reducing retry interval`);
          currentInterval = Math.max(pollingInterval, currentInterval * 0.5); // Reduce interval on network restore
        }
      });
      
      // Store cleanup function
      this.networkChangeListeners.set(orderId, networkChangeCleanup);

      const poll = async () => {
        attempts++;
        this.pollingAttempts.set(orderId, attempts);

        try {
          // Enhanced fetch with timeout detection
          const response = await safeFetch(`/api/orders/${orderId}`, {
            timeout: 15000, // 15s timeout for polling requests
            retryOnNetworkChange: true
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          // Check if response has content
          const contentLength = response.headers.get('content-length');
          if (contentLength === '0') {
            throw new Error('Empty response body');
          }

          // Check content type
          const contentType = response.headers.get('content-type');
          if (contentType && !contentType.includes('application/json')) {
            console.warn(`Unexpected content type: ${contentType}`);
          }

          let order: OrderStatus;
          try {
            const responseText = await response.text();
            if (!responseText.trim()) {
              throw new Error('Empty response body');
            }
            order = JSON.parse(responseText);
          } catch (parseError) {
            throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
          }
          
          // Check if order is in a final state
          const finalStates = ['paid', 'cancelled', 'refunded', 'delivered'];
          if (finalStates.includes(order.state)) {
            this.stopPolling(orderId);
            onComplete?.(order);
            resolve({
              success: true,
              finalStatus: order,
              attempts
            });
            return;
          }

          // Notify of status update
          onStatusUpdate?.(order);

          // Check if we've exceeded max attempts or total duration
          const elapsed = Date.now() - startTime;
          if (attempts >= maxPollingAttempts) {
            this.stopPolling(orderId);
            const error = new Error('Maximum polling attempts reached');
            onError?.(error);
            resolve({
              success: false,
              error: error.message,
              attempts
            });
            return;
          }
          
          if (elapsed >= maxTotalDuration) {
            this.stopPolling(orderId);
            const error = new Error(`Maximum polling duration exceeded (${maxTotalDuration}ms)`);
            onError?.(error);
            resolve({
              success: false,
              error: error.message,
              attempts
            });
            return;
          }

          // Schedule next poll with exponential backoff
          if (exponentialBackoff) {
            currentInterval = Math.min(currentInterval * 1.5, 10000); // Max 10 seconds
          }

          const timeoutId = setTimeout(poll, currentInterval);
          this.activePollers.set(orderId, timeoutId);

        } catch (error) {
          console.error(`Error polling order ${orderId}:`, error);
          
          // Detect specific error types for better handling
          const isTimeout = error && (error.isTimeout || error.code === 'TIMEOUT');
          const isNetworkChange = error && (error.isNetworkChange || error.code === 'NETWORK_CHANGE');
          const isNetworkError = error && (error.isNetworkError || error.code === 'NETWORK_ERROR');
          
          // Check if we should retry on error
          const elapsed = Date.now() - startTime;
          if (attempts < maxPollingAttempts && elapsed < maxTotalDuration) {
            const errorObj = new Error(mapApiErrorToMessage(error));
            
            // Notify of specific error types
            if (isTimeout) {
              notifyWebhookFailure(orderId, error, {
                showPolling: true,
                isTimeout: true
              });
            } else if (isNetworkChange || isNetworkError) {
              notifyNetworkError(error, {
                context: `Order ${orderId} polling`,
                showPolling: true,
                isRetryable: true
              });
            }
            
            onError?.(errorObj);
            
            // Adjust retry delay based on error type
            let retryDelay = Math.min(currentInterval * 2, 15000); // Max 15 seconds
            
            if (isNetworkChange) {
              // Shorter delay for network changes, as they might recover quickly
              retryDelay = Math.min(retryDelay * 0.5, 5000);
            } else if (isTimeout) {
              // Longer delay for timeouts
              retryDelay = Math.min(retryDelay * 1.5, 20000);
            }
            
            const timeoutId = setTimeout(poll, retryDelay);
            this.activePollers.set(orderId, timeoutId);
          } else {
            this.stopPolling(orderId);
            const elapsed = Date.now() - startTime;
            const reason = attempts >= maxPollingAttempts ? 'maximum attempts' : 'maximum duration';
            const finalError = new Error(`Failed to get order status after ${attempts} attempts (${elapsed}ms elapsed, stopped due to ${reason}): ${mapApiErrorToMessage(error)}`);
            
            // Final error notification
            if (isTimeout) {
              notifyWebhookFailure(orderId, finalError, {
                showRetry: false,
                isTimeout: true
              });
            } else if (isNetworkError || isNetworkChange) {
              notifyNetworkError(finalError, {
                context: `Order ${orderId} final polling failure`,
                isRetryable: false
              });
            }
            
            onError?.(finalError);
            resolve({
              success: false,
              error: finalError.message,
              attempts
            });
          }
        }
      };

      // Start polling immediately
      poll();
    });
  }

  /**
   * Stop polling for a specific order
   */
  stopPolling(orderId: string): void {
    const timeoutId = this.activePollers.get(orderId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.activePollers.delete(orderId);
    }
    
    // Clean up network change listener
    const networkCleanup = this.networkChangeListeners.get(orderId);
    if (networkCleanup) {
      networkCleanup();
      this.networkChangeListeners.delete(orderId);
    }
    
    this.pollingAttempts.delete(orderId);
    this.pollingStartTimes.delete(orderId);
  }

  /**
   * Stop all active polling
   */
  stopAllPolling(): void {
    this.activePollers.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.activePollers.clear();
    
    // Clean up all network change listeners
    this.networkChangeListeners.forEach((cleanup) => {
      cleanup();
    });
    this.networkChangeListeners.clear();
    
    this.pollingAttempts.clear();
    this.pollingStartTimes.clear();
  }

  /**
   * Get polling status for an order
   */
  getPollingStatus(orderId: string): { isPolling: boolean; attempts: number; elapsedTime: number } {
    const startTime = this.pollingStartTimes.get(orderId);
    return {
      isPolling: this.activePollers.has(orderId),
      attempts: this.pollingAttempts.get(orderId) || 0,
      elapsedTime: startTime ? Date.now() - startTime : 0
    };
  }

  /**
   * Get all active polling orders
   */
  getActivePollingOrders(): string[] {
    return Array.from(this.activePollers.keys());
  }
}

// Export singleton instance
export const webhookFallbackManager = new WebhookFallbackManager();

/**
 * Convenience function to start polling with default options
 */
export async function pollOrderStatus(
  orderId: string,
  options: WebhookFallbackOptions = {}
): Promise<PollingResult> {
  return webhookFallbackManager.startPolling(orderId, options);
}

/**
 * Enhanced order status checking with webhook fallback
 */
export async function checkOrderStatusWithFallback(
  orderId: string,
  options: WebhookFallbackOptions = {}
): Promise<{ order: OrderStatus; fromPolling: boolean }> {
  try {
    // First, try to get current status with enhanced timeout detection
    const response = await safeFetch(`/api/orders/${orderId}`, {
      timeout: 10000, // 10s timeout for status checks
      retryOnNetworkChange: true
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check if response has content
    const contentLength = response.headers.get('content-length');
    if (contentLength === '0') {
      throw new Error('Empty response body');
    }

    // Check content type
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
      console.warn(`Unexpected content type: ${contentType}`);
    }

    let order: OrderStatus;
    try {
      const responseText = await response.text();
      if (!responseText.trim()) {
        throw new Error('Empty response body');
      }
      order = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
    }
    
    // If order is in a pending state, start polling as fallback
    const pendingStates = ['pending', 'pending_payment'];
    if (pendingStates.includes(order.state)) {
      console.log(`Order ${orderId} is in pending state, starting fallback polling`);
      
      // Start polling in background (don't await)
      webhookFallbackManager.startPolling(orderId, {
        ...options,
        onStatusUpdate: (updatedOrder) => {
          console.log(`Order ${orderId} status updated via polling:`, updatedOrder.state);
          options.onStatusUpdate?.(updatedOrder);
        },
        onError: (error) => {
          console.error(`Polling error for order ${orderId}:`, error);
          options.onError?.(error);
        },
        onComplete: (finalOrder) => {
          console.log(`Order ${orderId} polling completed:`, finalOrder.state);
          options.onComplete?.(finalOrder);
        }
      });
    }

    return { order, fromPolling: false };
  } catch (error) {
    console.error(`Error checking order ${orderId} status:`, error);
    throw error;
  }
}
