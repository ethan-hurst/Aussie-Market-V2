import { describe, it, expect } from 'vitest';
import { 
  mapApiErrorToMessage, 
  isRetryableError, 
  getRetryDelay, 
  getRetryMessage, 
  categorizePaymentError 
} from '../errors';

describe('Error Handling Utilities', () => {
  describe('mapApiErrorToMessage', () => {
    it('should map payment errors to user-friendly messages', () => {
      expect(mapApiErrorToMessage('payment not completed')).toBe(
        'Your payment could not be processed. Please check your payment details and try again.'
      );
      
      expect(mapApiErrorToMessage('card declined')).toBe(
        'Your card was declined. Please check your payment details or try a different card.'
      );
      
      expect(mapApiErrorToMessage('webhook failed')).toBe(
        'Payment confirmation is taking longer than expected. Your payment may still be processing.'
      );
    });

    it('should handle network errors', () => {
      expect(mapApiErrorToMessage('network error')).toBe(
        'Network error. Check your connection and try again.'
      );
      
      expect(mapApiErrorToMessage('timeout')).toBe(
        'Request timed out. Please try again.'
      );
    });

    it('should return default message for unknown errors', () => {
      expect(mapApiErrorToMessage('unknown error')).toBe(
        'Unknown error'
      );
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      expect(isRetryableError('network error')).toBe(true);
      expect(isRetryableError('connection timeout')).toBe(true);
      expect(isRetryableError('rate limit exceeded')).toBe(true);
      expect(isRetryableError('webhook processing')).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      expect(isRetryableError('card declined')).toBe(false);
      expect(isRetryableError('insufficient funds')).toBe(false);
      expect(isRetryableError('expired card')).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should calculate exponential backoff delays', () => {
      expect(getRetryDelay(0, 1000, true)).toBe(1000);
      expect(getRetryDelay(1, 1000, true)).toBe(2000);
      expect(getRetryDelay(2, 1000, true)).toBe(4000);
      expect(getRetryDelay(3, 1000, true)).toBe(8000);
    });

    it('should cap delays at maximum', () => {
      expect(getRetryDelay(10, 1000, true)).toBe(30000);
    });

    it('should use linear delays when exponential backoff is disabled', () => {
      expect(getRetryDelay(0, 1000, false)).toBe(1000);
      expect(getRetryDelay(5, 1000, false)).toBe(1000);
    });
  });

  describe('getRetryMessage', () => {
    it('should format retry messages correctly', () => {
      expect(getRetryMessage('network error', 0, 3)).toBe('Network error. Check your connection and try again.');
      expect(getRetryMessage('network error', 1, 3)).toBe('Network error. Check your connection and try again. Retrying... (2/4)');
      expect(getRetryMessage('network error', 3, 3)).toBe('Network error. Check your connection and try again. Please contact support if the problem persists.');
    });
  });

  describe('categorizePaymentError', () => {
    it('should categorize card errors correctly', () => {
      const result = categorizePaymentError('card declined');
      
      expect(result.type).toBe('card_error');
      expect(result.canRetry).toBe(false);
      expect(result.requiresNewPayment).toBe(true);
      expect(result.shouldContactSupport).toBe(false);
    });

    it('should categorize network errors correctly', () => {
      const result = categorizePaymentError('network error');
      
      expect(result.type).toBe('network_error');
      expect(result.canRetry).toBe(true);
      expect(result.requiresNewPayment).toBe(false);
      expect(result.shouldContactSupport).toBe(false);
    });

    it('should categorize webhook errors correctly', () => {
      const result = categorizePaymentError('webhook processing');
      
      expect(result.type).toBe('webhook_error');
      expect(result.canRetry).toBe(true);
      expect(result.requiresNewPayment).toBe(false);
      expect(result.shouldContactSupport).toBe(true);
    });

    it('should categorize unknown errors correctly', () => {
      const result = categorizePaymentError('unknown error');
      
      expect(result.type).toBe('unknown');
      expect(result.canRetry).toBe(false);
      expect(result.requiresNewPayment).toBe(false);
      expect(result.shouldContactSupport).toBe(true);
    });
  });
});
