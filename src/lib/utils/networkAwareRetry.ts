import { NetworkMonitor } from '../http';
import { notifyNetworkError, notifyWebhookFailure } from '../errorNotificationSystem';

export interface NetworkAwareRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  exponentialBackoff?: boolean;
  networkChangeResetCount?: boolean;
  onNetworkChange?: (isOnline: boolean) => void;
  onRetry?: (attempt: number, delay: number, error: any) => void;
  context?: string;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  networkChanges: number;
}

/**
 * Enhanced retry mechanism that adapts to network condition changes
 */
export class NetworkAwareRetryManager {
  private static instance: NetworkAwareRetryManager;
  
  private constructor() {
    // Initialize network monitoring
    NetworkMonitor.initialize();
  }
  
  static getInstance(): NetworkAwareRetryManager {
    if (!this.instance) {
      this.instance = new NetworkAwareRetryManager();
    }
    return this.instance;
  }

  /**
   * Execute a function with network-aware retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: NetworkAwareRetryOptions = {}
  ): Promise<RetryResult<T>> {
    const {
      maxRetries = 3,
      baseDelayMs = 1000,
      maxDelayMs = 30000,
      exponentialBackoff = true,
      networkChangeResetCount = true,
      onNetworkChange,
      onRetry,
      context = 'Network operation'
    } = options;

    let attempts = 0;
    let networkChanges = 0;
    let currentDelay = baseDelayMs;
    let lastNetworkStatus = NetworkMonitor.isOnline();
    
    // Set up network monitoring for this retry session
    const networkChangeCleanup = NetworkMonitor.onNetworkChange((isOnline) => {
      if (lastNetworkStatus !== isOnline) {
        networkChanges++;
        lastNetworkStatus = isOnline;
        
        if (isOnline) {
          console.log(`Network restored during ${context} - resetting retry strategy`);
          if (networkChangeResetCount) {
            // Reset retry count when network comes back online
            attempts = Math.max(0, attempts - 1);
            currentDelay = baseDelayMs; // Reset to base delay
          }
          
          // Notify successful network restoration
          notifyNetworkError(
            new Error('Network connection restored'),
            { 
              context: `${context} - connection restored`,
              isRetryable: false
            }
          );
        } else {
          console.log(`Network lost during ${context}`);
          // Notify network loss
          notifyNetworkError(
            new Error('Network connection lost'),
            { 
              context,
              showPolling: true,
              isRetryable: true
            }
          );
        }
        
        onNetworkChange?.(isOnline);
      }
    });

    const cleanup = () => {
      networkChangeCleanup();
    };

    try {
      while (attempts <= maxRetries) {
        attempts++;
        
        try {
          const result = await operation();
          cleanup();
          
          return {
            success: true,
            result,
            attempts,
            networkChanges
          };
        } catch (error) {
          const isLastAttempt = attempts > maxRetries;
          const isNetworkError = this.isNetworkRelatedError(error);
          const isTimeout = this.isTimeoutError(error);
          
          // If offline and this is a network error, wait for network to come back
          if (!NetworkMonitor.isOnline() && isNetworkError) {
            console.log(`Network is offline during ${context}, waiting for restoration...`);
            
            // Wait for network to come back online with timeout
            const networkRestored = await this.waitForNetworkRestore(30000); // 30s timeout
            
            if (networkRestored && attempts <= maxRetries) {
              console.log(`Network restored, retrying ${context}...`);
              continue; // Retry immediately when network is restored
            }
          }
          
          if (isLastAttempt) {
            // Final attempt failed
            if (isTimeout) {
              notifyWebhookFailure('unknown', error, {
                showRetry: false,
                isTimeout: true
              });
            } else if (isNetworkError) {
              notifyNetworkError(error, {
                context: `${context} - final failure`,
                isRetryable: false
              });
            }
            
            cleanup();
            return {
              success: false,
              error: error instanceof Error ? error : new Error(String(error)),
              attempts,
              networkChanges
            };
          }
          
          // Calculate delay for next retry
          if (exponentialBackoff) {
            currentDelay = Math.min(currentDelay * 2, maxDelayMs);
          }
          
          // Adjust delay based on error type
          if (isNetworkError) {
            // Shorter delays for network errors as they might recover quickly
            currentDelay = Math.min(currentDelay * 0.5, 5000);
          } else if (isTimeout) {
            // Longer delays for timeouts
            currentDelay = Math.min(currentDelay * 1.5, maxDelayMs);
          }
          
          console.log(`${context} failed (attempt ${attempts}/${maxRetries + 1}), retrying in ${currentDelay}ms:`, error);
          
          onRetry?.(attempts, currentDelay, error);
          
          // Wait before retry
          await this.delay(currentDelay);
        }
      }
      
      // Should not reach here, but just in case
      cleanup();
      return {
        success: false,
        error: new Error('Maximum retry attempts exceeded'),
        attempts,
        networkChanges
      };
      
    } catch (error) {
      cleanup();
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        attempts,
        networkChanges
      };
    }
  }

  /**
   * Wait for network to be restored
   */
  private async waitForNetworkRestore(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (NetworkMonitor.isOnline()) {
        resolve(true);
        return;
      }
      
      const timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);
      
      const cleanup = NetworkMonitor.onNetworkChange((isOnline) => {
        if (isOnline) {
          clearTimeout(timeout);
          cleanup();
          resolve(true);
        }
      });
    });
  }

  /**
   * Check if error is network-related
   */
  private isNetworkRelatedError(error: any): boolean {
    if (!error) return false;
    
    if (error.isNetworkError || error.code === 'NETWORK_ERROR') return true;
    if (error.isNetworkChange || error.code === 'NETWORK_CHANGE') return true;
    
    const message = error.message || String(error);
    return message.toLowerCase().includes('network') ||
           message.toLowerCase().includes('connection') ||
           message.toLowerCase().includes('fetch') ||
           message.includes('ERR_NETWORK') ||
           message.includes('ERR_INTERNET_DISCONNECTED');
  }

  /**
   * Check if error is timeout-related
   */
  private isTimeoutError(error: any): boolean {
    if (!error) return false;
    
    if (error.isTimeout || error.code === 'TIMEOUT') return true;
    
    const message = error.message || String(error);
    return message.toLowerCase().includes('timeout') ||
           message.toLowerCase().includes('took too long') ||
           message.includes('AbortError');
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Convenience function for network-aware retry
 */
export async function retryWithNetworkAwareness<T>(
  operation: () => Promise<T>,
  options?: NetworkAwareRetryOptions
): Promise<RetryResult<T>> {
  return NetworkAwareRetryManager.getInstance().executeWithRetry(operation, options);
}

/**
 * Convenience function specifically for webhook-related operations
 */
export async function retryWebhookOperation<T>(
  operation: () => Promise<T>,
  orderId?: string,
  options?: Omit<NetworkAwareRetryOptions, 'context'>
): Promise<RetryResult<T>> {
  return retryWithNetworkAwareness(operation, {
    ...options,
    context: orderId ? `Webhook operation for order ${orderId}` : 'Webhook operation'
  });
}