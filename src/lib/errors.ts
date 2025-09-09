export type ApiErrorInput = unknown;

const defaultMessage = 'Something went wrong. Please try again.';

export function mapApiErrorToMessage(error: ApiErrorInput): string {
  if (!error) return defaultMessage;

  // Supabase error shape
  const sb = error as any;
  if (sb?.message && typeof sb.message === 'string') {
    return normalize(sb.message);
  }

  // Stripe error shape
  if (sb?.error && typeof sb.error?.message === 'string') {
    return normalize(sb.error.message);
  }

  // API error: { error: string }
  if (typeof sb?.error === 'string') {
    return normalize(sb.error);
  }

  if (typeof error === 'string') return normalize(error);

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') return defaultMessage;
  } catch {}

  return defaultMessage;
}

function normalize(message: string): string {
  const m = message.toLowerCase();
  
  // Authentication and authorization errors
  if (m.includes('not authorized') || m.includes('permission denied')) return 'You are not allowed to perform this action.';
  
  // Auction-specific errors
  if (m.includes('auction ended')) return 'This auction has already ended.';
  if (m.includes('below minimum') || m.includes('minimum bid')) return 'Your bid is below the minimum allowed.';
  if (m.includes('reserve')) return 'Your bid does not meet the reserve price.';
  
  // Payment-specific errors
  if (m.includes('payment not completed') || m.includes('payment failed')) return 'Your payment could not be processed. Please check your payment details and try again.';
  if (m.includes('payment intent') && m.includes('failed')) return 'Payment processing failed. Please try a different payment method.';
  if (m.includes('card declined') || m.includes('insufficient funds')) return 'Your card was declined. Please check your payment details or try a different card.';
  if (m.includes('expired card')) return 'Your card has expired. Please use a different payment method.';
  if (m.includes('invalid card') || m.includes('incorrect card')) return 'The card information is invalid. Please check your card details.';
  if (m.includes('webhook') && m.includes('failed')) return 'Payment confirmation is taking longer than expected. Your payment may still be processing.';
  if (m.includes('order not found')) return 'Order not found. Please check your order details or contact support.';
  if (m.includes('payment confirmation failed')) return 'We could not confirm your payment. Please check your order status or contact support.';
  if (m.includes('refund') && m.includes('failed')) return 'Refund processing failed. Please contact support for assistance.';
  
  // Network and connectivity errors
  if (m.includes('network') || m.includes('fetch') || m.includes('connection')) return 'Network error. Check your connection and try again.';
  if (m.includes('timeout')) return 'Request timed out. Please try again.';
  if (m.includes('offline') || m.includes('no internet')) return 'You appear to be offline. Please check your internet connection.';
  
  // Rate limiting
  if (m.includes('rate limit') || m.includes('too many requests')) return 'Too many requests. Please wait a moment and try again.';
  
  // Generic webhook and processing errors
  if (m.includes('webhook') || m.includes('processing')) return 'Payment processing is taking longer than expected. Please check your order status.';
  
  return capitalize(message);
}

function capitalize(s: string): string {
  if (!s) return defaultMessage;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Error recovery and retry utilities
export interface ErrorRecoveryOptions {
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
  retryableErrors?: string[];
}

export interface ErrorRecoveryResult {
  success: boolean;
  error?: string;
  retryCount: number;
  shouldRetry: boolean;
}

/**
 * Determine if an error is retryable based on error type and message
 */
export function isRetryableError(error: ApiErrorInput): boolean {
  if (!error) return false;
  
  const message = mapApiErrorToMessage(error).toLowerCase();
  
  // Network and connectivity errors are retryable
  if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
    return true;
  }
  
  // Rate limiting is retryable
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return true;
  }
  
  // Webhook processing errors are retryable
  if (message.includes('webhook') || message.includes('processing')) {
    return true;
  }
  
  // Payment processing errors (except card issues) are retryable
  if (message.includes('payment') && !message.includes('card') && !message.includes('declined')) {
    return true;
  }
  
  return false;
}

/**
 * Get retry delay with optional exponential backoff
 */
export function getRetryDelay(attempt: number, baseDelay: number = 1000, exponentialBackoff: boolean = true): number {
  if (!exponentialBackoff) return baseDelay;
  return Math.min(baseDelay * Math.pow(2, attempt), 30000); // Max 30 seconds
}

/**
 * Get user-friendly retry message
 */
export function getRetryMessage(error: ApiErrorInput, attempt: number, maxRetries: number): string {
  const baseMessage = mapApiErrorToMessage(error);
  
  if (attempt >= maxRetries) {
    return `${baseMessage} Please contact support if the problem persists.`;
  }
  
  if (attempt === 0) {
    return baseMessage;
  }
  
  return `${baseMessage} Retrying... (${attempt + 1}/${maxRetries + 1})`;
}

/**
 * Payment-specific error categorization
 */
export interface PaymentErrorInfo {
  type: 'card_error' | 'network_error' | 'processing_error' | 'webhook_error' | 'unknown';
  userMessage: string;
  canRetry: boolean;
  requiresNewPayment: boolean;
  shouldContactSupport: boolean;
}

export function categorizePaymentError(error: ApiErrorInput): PaymentErrorInfo {
  const originalMessage = typeof error === 'string' ? error.toLowerCase() : '';
  const mappedMessage = mapApiErrorToMessage(error).toLowerCase();
  
  // Card-related errors - check original message first
  if (originalMessage.includes('card declined') || originalMessage.includes('insufficient funds') || 
      originalMessage.includes('expired card') || originalMessage.includes('invalid card') ||
      originalMessage.includes('card') && (originalMessage.includes('declined') || originalMessage.includes('expired'))) {
    return {
      type: 'card_error',
      userMessage: mapApiErrorToMessage(error),
      canRetry: false,
      requiresNewPayment: true,
      shouldContactSupport: false
    };
  }
  
  // Network errors
  if (originalMessage.includes('network') || originalMessage.includes('connection') || originalMessage.includes('timeout') ||
      mappedMessage.includes('network') || mappedMessage.includes('connection') || mappedMessage.includes('timeout')) {
    return {
      type: 'network_error',
      userMessage: mapApiErrorToMessage(error),
      canRetry: true,
      requiresNewPayment: false,
      shouldContactSupport: false
    };
  }
  
  // Webhook processing errors
  if (originalMessage.includes('webhook') || originalMessage.includes('processing') ||
      mappedMessage.includes('webhook') || mappedMessage.includes('processing')) {
    return {
      type: 'webhook_error',
      userMessage: mapApiErrorToMessage(error),
      canRetry: true,
      requiresNewPayment: false,
      shouldContactSupport: true
    };
  }
  
  // General processing errors
  if (originalMessage.includes('payment') || originalMessage.includes('confirmation') ||
      mappedMessage.includes('payment') || mappedMessage.includes('confirmation')) {
    return {
      type: 'processing_error',
      userMessage: mapApiErrorToMessage(error),
      canRetry: true,
      requiresNewPayment: false,
      shouldContactSupport: true
    };
  }
  
  // Unknown errors
  return {
    type: 'unknown',
    userMessage: mapApiErrorToMessage(error),
    canRetry: false,
    requiresNewPayment: false,
    shouldContactSupport: true
  };
}


