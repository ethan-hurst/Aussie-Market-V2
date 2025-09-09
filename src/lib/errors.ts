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
  if (m.includes('timeout') || m.includes('timed out')) return 'Connection timed out. Please try again.';
  if (m.includes('offline') || m.includes('no internet')) return 'You appear to be offline. Please check your internet connection.';
  if (m.includes('dns resolution')) return 'Network connection failed. Please check your internet connection.';
  
  // Rate limiting
  if (m.includes('rate limit') || m.includes('too many requests')) return 'Too many requests. Please wait a moment and try again.';
  
  // Generic webhook and processing errors
  if (m.includes('webhook timeout') || (m.includes('webhook') && m.includes('timeout'))) return 'Payment processing timed out. Please check your order status.';
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
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
  const mappedMessage = mapApiErrorToMessage(error).toLowerCase();
  
  // Enhanced error message detection
  const checkMessage = (msg: string) => 
    originalMessage.includes(msg) || errorMessage.includes(msg) || mappedMessage.includes(msg);
  
  // Stripe-specific errors (enhanced detection with more patterns)
  if (checkMessage('your card was declined') || checkMessage('card_declined') || 
      checkMessage('insufficient_funds') || checkMessage('card declined') ||
      checkMessage('expired_card') || checkMessage('invalid_card_number') ||
      checkMessage('incorrect_cvc') || checkMessage('card_error') ||
      checkMessage('expired card') || checkMessage('invalid card') ||
      checkMessage('cvc check failed') || checkMessage('card has expired') ||
      checkMessage('authentication_required') || checkMessage('3d_secure') ||
      checkMessage('payment_intent_authentication_failure') ||
      checkMessage('card security code') || checkMessage('security code is incorrect') ||
      checkMessage('authentication_failure') || checkMessage('3d secure authentication') ||
      checkMessage('authentication failed')) {
    return {
      type: 'card_error',
      userMessage: mapApiErrorToMessage(error),
      canRetry: false,
      requiresNewPayment: true,
      shouldContactSupport: false
    };
  }
  
  // Payment authentication timeout - specific processing error  
  if (checkMessage('payment authentication timed out') || 
      (checkMessage('authentication') && checkMessage('timed out') && !checkMessage('network'))) {
    return {
      type: 'processing_error',
      userMessage: mapApiErrorToMessage(error),
      canRetry: true,
      requiresNewPayment: false,
      shouldContactSupport: true
    };
  }
  
  // Network and connectivity errors (enhanced) - Check before webhook errors
  if (checkMessage('network') || checkMessage('connection') || checkMessage('timeout') ||
      checkMessage('fetch') || checkMessage('cors') || checkMessage('offline') ||
      checkMessage('net::') || checkMessage('failed to fetch') ||
      checkMessage('connection timeout') || checkMessage('network error') ||
      (checkMessage('timed out') && !checkMessage('payment'))) {
    return {
      type: 'network_error',
      userMessage: mapApiErrorToMessage(error),
      canRetry: true,
      requiresNewPayment: false,
      shouldContactSupport: false
    };
  }
  
  // Payment Intent specific errors (Stripe)
  if (checkMessage('payment_intent') && (checkMessage('failed') || checkMessage('canceled'))) {
    return {
      type: 'processing_error',
      userMessage: mapApiErrorToMessage(error),
      canRetry: true,
      requiresNewPayment: false,
      shouldContactSupport: true
    };
  }
  
  // Webhook processing errors (enhanced)
  if (checkMessage('webhook') || checkMessage('confirmation failed') ||
      checkMessage('payment processing') || checkMessage('order status') ||
      checkMessage('stripe webhook')) {
    return {
      type: 'webhook_error',
      userMessage: mapApiErrorToMessage(error),
      canRetry: true,
      requiresNewPayment: false,
      shouldContactSupport: true
    };
  }
  
  // Authentication and authorization errors
  if (checkMessage('unauthorized') || checkMessage('forbidden') || 
      checkMessage('authentication') || checkMessage('not authorized')) {
    return {
      type: 'processing_error',
      userMessage: 'Authentication failed. Please refresh and try again.',
      canRetry: true,
      requiresNewPayment: false,
      shouldContactSupport: true
    };
  }
  
  // Rate limiting
  if (checkMessage('rate limit') || checkMessage('too many requests') || checkMessage('429')) {
    return {
      type: 'processing_error',
      userMessage: 'Too many payment attempts. Please wait a moment and try again.',
      canRetry: true,
      requiresNewPayment: false,
      shouldContactSupport: false
    };
  }
  
  // Server errors (5xx)
  if (checkMessage('500') || checkMessage('502') || checkMessage('503') || 
      checkMessage('server error') || checkMessage('internal server')) {
    return {
      type: 'processing_error',
      userMessage: 'Server temporarily unavailable. Please try again in a few minutes.',
      canRetry: true,
      requiresNewPayment: false,
      shouldContactSupport: true
    };
  }
  
  // General processing errors (enhanced)
  if (checkMessage('payment') || checkMessage('confirmation') || checkMessage('order') ||
      checkMessage('stripe') || checkMessage('billing')) {
    return {
      type: 'processing_error',
      userMessage: mapApiErrorToMessage(error),
      canRetry: true,
      requiresNewPayment: false,
      shouldContactSupport: true
    };
  }
  
  // Unknown errors - be more conservative
  return {
    type: 'unknown',
    userMessage: mapApiErrorToMessage(error),
    canRetry: false,
    requiresNewPayment: false,
    shouldContactSupport: true
  };
}


