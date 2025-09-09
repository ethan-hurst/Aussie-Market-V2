/**
 * MVP Payment Integration Validation
 * Tests the core payment flow required for MVP functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { categorizePaymentError, mapApiErrorToMessage } from '../errors';

describe('MVP Payment Integration Validation', () => {
  describe('Payment Error Categorization', () => {
    it('should correctly categorize card errors as requiring new payment', () => {
      const cardErrors = [
        'Your card was declined.',
        'Your card security code is incorrect.',
        'Your card has expired.',
        'Insufficient funds available.',
        '3D Secure authentication failed or was declined by the customer.'
      ];

      cardErrors.forEach(error => {
        const result = categorizePaymentError(error);
        expect(result.type).toBe('card_error');
        expect(result.requiresNewPayment).toBe(true);
        expect(result.canRetry).toBe(false);
      });
    });

    it('should correctly categorize network errors as retryable', () => {
      const networkErrors = [
        'Request timed out during payment processing',
        'Network error occurred',
        'Connection failed',
        'DNS resolution failed'
      ];

      networkErrors.forEach(error => {
        const result = categorizePaymentError(error);
        expect(result.type).toBe('network_error');
        expect(result.canRetry).toBe(true);
        expect(result.requiresNewPayment).toBe(false);
      });
    });

    it('should correctly categorize processing errors', () => {
      const processingErrors = [
        'Payment authentication timed out', // This should be processing_error
        'Rate limit exceeded',
        'Too many requests'
      ];

      processingErrors.forEach(error => {
        const result = categorizePaymentError(error);
        expect(result.type).toBe('processing_error');
        expect(result.canRetry).toBe(true);
      });
    });

    it('should correctly categorize webhook errors', () => {
      const webhookErrors = [
        'Webhook failed to process',
        'Payment confirmation webhook failed',
        'Order status webhook error'
      ];

      webhookErrors.forEach(error => {
        const result = categorizePaymentError(error);
        expect(result.type).toBe('webhook_error');
        expect(result.canRetry).toBe(true);
      });
    });
  });

  describe('User-Friendly Error Messages', () => {
    it('should map common payment errors to user-friendly messages', () => {
      const errorMappings = [
        ['card declined', 'Your card was declined. Please check your payment details or try a different card.'],
        ['insufficient funds', 'Your card was declined. Please check your payment details or try a different card.'],
        ['expired card', 'Your card has expired. Please use a different payment method.'],
        ['timeout', 'Connection timed out. Please try again.'],
        ['network error', 'Network error. Check your connection and try again.'],
        ['webhook timeout', 'Connection timed out. Please try again.']
      ];

      errorMappings.forEach(([input, expected]) => {
        const result = mapApiErrorToMessage(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('MVP Payment Flow Requirements', () => {
    it('should ensure all MVP-required error patterns are handled', () => {
      // These are the critical error scenarios that MVP must handle
      const mvpCriticalErrors = [
        // Card errors that prevent payment completion
        { error: 'Your card was declined.', expectedType: 'card_error', requiresNewPayment: true },
        { error: 'Insufficient funds', expectedType: 'card_error', requiresNewPayment: true },
        { error: 'Your card security code is incorrect.', expectedType: 'card_error', requiresNewPayment: true },
        
        // Network errors that should allow retry
        { error: 'Request timed out', expectedType: 'network_error', canRetry: true },
        { error: 'Network error', expectedType: 'network_error', canRetry: true },
        
        // Processing errors that indicate system issues
        { error: 'Payment authentication timed out', expectedType: 'processing_error', canRetry: true },
        { error: 'Rate limit exceeded', expectedType: 'processing_error', canRetry: true },
        
        // Webhook errors that need polling fallback
        { error: 'Webhook failed to process', expectedType: 'webhook_error', canRetry: true }
      ];

      mvpCriticalErrors.forEach(({ error, expectedType, requiresNewPayment, canRetry }) => {
        const result = categorizePaymentError(error);
        expect(result.type).toBe(expectedType);
        
        if (requiresNewPayment !== undefined) {
          expect(result.requiresNewPayment).toBe(requiresNewPayment);
        }
        
        if (canRetry !== undefined) {
          expect(result.canRetry).toBe(canRetry);
        }
      });
    });

    it('should provide actionable guidance for each error type', () => {
      const errorActions = [
        { error: 'card declined', shouldContactSupport: false }, // User can try different card
        { error: 'network timeout', shouldContactSupport: false }, // User can retry
        { error: 'processing error', shouldContactSupport: true }, // System issue
        { error: 'webhook failure', shouldContactSupport: true } // System issue
      ];

      errorActions.forEach(({ error, shouldContactSupport }) => {
        const result = categorizePaymentError(error);
        expect(result.shouldContactSupport).toBe(shouldContactSupport);
      });
    });
  });

  describe('Payment Security Validation', () => {
    it('should ensure payment amount validation patterns are recognized', () => {
      const securityErrors = [
        'Payment amount does not match order amount',
        'Order cannot be paid for in current state',
        'Payment intent does not match order',
        'Unauthorized access to order'
      ];

      securityErrors.forEach(error => {
        const result = categorizePaymentError(error);
        // These should be categorized as processing errors requiring support
        expect(result.type).toBe('processing_error');
        expect(result.shouldContactSupport).toBe(true);
      });
    });
  });
});