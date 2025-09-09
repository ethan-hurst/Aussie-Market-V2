import { mapApiErrorToMessage } from '$lib/errors';

/**
 * Network condition monitoring utilities
 */
export class NetworkMonitor {
  private static lastOnlineStatus = navigator?.onLine ?? true;
  private static networkChangeCallbacks: ((online: boolean) => void)[] = [];
  private static isInitialized = false;

  static initialize() {
    if (this.isInitialized || typeof navigator === 'undefined') return;
    
    this.isInitialized = true;
    this.lastOnlineStatus = navigator.onLine;
    
    // Listen for network change events
    window.addEventListener('online', () => {
      this.lastOnlineStatus = true;
      this.networkChangeCallbacks.forEach(callback => callback(true));
    });
    
    window.addEventListener('offline', () => {
      this.lastOnlineStatus = false;
      this.networkChangeCallbacks.forEach(callback => callback(false));
    });
  }
  
  static isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
  
  static hasNetworkChanged(): boolean {
    const currentStatus = this.isOnline();
    if (currentStatus !== this.lastOnlineStatus) {
      this.lastOnlineStatus = currentStatus;
      return true;
    }
    return false;
  }
  
  static onNetworkChange(callback: (online: boolean) => void): () => void {
    this.initialize();
    this.networkChangeCallbacks.push(callback);
    
    // Return cleanup function
    return () => {
      const index = this.networkChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.networkChangeCallbacks.splice(index, 1);
      }
    };
  }
}

/**
 * Enhanced fetch with timeout detection and better error handling
 */
export interface SafeFetchOptions extends RequestInit {
  timeout?: number;
  retryOnNetworkChange?: boolean;
}

export async function safeFetch(
  input: RequestInfo | URL, 
  options: SafeFetchOptions = {}
) {
  const { timeout = 30000, retryOnNetworkChange = false, ...init } = options;
  
  // Initialize network monitoring
  NetworkMonitor.initialize();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);
  
  try {
    const fetchOptions: RequestInit = {
      ...init,
      signal: controller.signal
    };
    
    const res = await fetch(input, fetchOptions);
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      let payload: any = null;
      try { 
        payload = await res.json(); 
      } catch {}
      
      // Enhanced error detection for specific webhook timeout scenarios
      const message = mapApiErrorToMessage(payload || { 
        error: `${res.status}`,
        status: res.status,
        statusText: res.statusText
      });
      
      const error = new Error(message);
      (error as any).status = res.status;
      (error as any).statusText = res.statusText;
      
      throw error;
    }
    
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    
    // Enhanced timeout and network error detection
    if (err.name === 'AbortError') {
      const timeoutError = new Error('Request timeout - the server took too long to respond');
      (timeoutError as any).code = 'TIMEOUT';
      (timeoutError as any).isTimeout = true;
      throw timeoutError;
    }
    
    // Check for network condition changes during request
    if (retryOnNetworkChange && NetworkMonitor.hasNetworkChanged()) {
      const networkError = new Error('Network conditions changed during request');
      (networkError as any).code = 'NETWORK_CHANGE';
      (networkError as any).isNetworkChange = true;
      throw networkError;
    }
    
    // Detect common network error patterns
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes('Failed to fetch') || 
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('ERR_NETWORK') ||
        errorMessage.includes('ERR_INTERNET_DISCONNECTED')) {
      const networkError = new Error('Network connection lost');
      (networkError as any).code = 'NETWORK_ERROR';
      (networkError as any).isNetworkError = true;
      throw networkError;
    }
    
    throw new Error(mapApiErrorToMessage(err));
  }
}


