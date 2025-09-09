import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { json } from '@sveltejs/kit';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
  auth: {
    getUser: vi.fn()
  }
};

// Mock the webhook handler
vi.mock('$lib/supabase', () => ({
  supabase: mockSupabase
}));

// Mock environment
vi.mock('$lib/env', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_mock',
    STRIPE_WEBHOOK_SECRET: 'whsec_mock'
  }
}));

// Mock Stripe
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      webhooks: {
        constructEvent: vi.fn()
      }
    }))
  };
});

describe('Webhook Idempotency System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up default environment
    process.env.NODE_ENV = 'test';
    process.env.E2E_TESTING = 'true';
  });

  describe('Event ID Deduplication', () => {
    it('should prevent duplicate processing of same event ID', async () => {
      const eventId = 'evt_test_duplicate_123';
      const orderId = 'order_test_123';
      
      // Mock first check - event already exists and processed
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            event_id: eventId,
            processed_at: new Date().toISOString(),
            error_message: null
          },
          error: null
        })
      });

      const mockRequest = new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'sig_mock'
        },
        body: JSON.stringify({
          id: eventId,
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'pi_test',
              metadata: { order_id: orderId },
              amount: 1000,
              currency: 'aud'
            }
          }
        })
      });

      // Import and test the handler
      const { POST } = await import('../../routes/api/webhooks/stripe/+server');
      const response = await POST({ request: mockRequest } as any);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(result.status).toBe('already_processed');
    });

    it('should allow retry of previously failed events', async () => {
      const eventId = 'evt_test_retry_123';
      const orderId = 'order_test_123';
      
      // Mock first check - event exists but failed
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            event_id: eventId,
            processed_at: new Date().toISOString(),
            error_message: 'Previous processing failed'
          },
          error: null
        })
      });

      // Mock order fetch for retry
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            state: 'pending_payment',
            stripe_payment_intent_id: null,
            version: 0
          },
          error: null
        })
      });

      // Mock advisory lock
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      // Mock successful update
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [{ id: orderId, state: 'paid' }],
          error: null
        })
      });

      // Mock payment upsert
      mockSupabase.from.mockReturnValueOnce({
        upsert: vi.fn().mockResolvedValue({ error: null })
      });

      const mockRequest = new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'sig_mock'
        },
        body: JSON.stringify({
          id: eventId,
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'pi_test',
              metadata: { order_id: orderId },
              amount: 1000,
              currency: 'aud'
            }
          }
        })
      });

      const { POST } = await import('../../routes/api/webhooks/stripe/+server');
      const response = await POST({ request: mockRequest } as any);

      expect(response.status).toBe(200);
    });

    it('should detect concurrent processing race condition', async () => {
      const eventId = 'evt_test_concurrent_123';
      
      // Mock first check - event exists but not processed (being processed)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            event_id: eventId,
            processed_at: null,
            error_message: null
          },
          error: null
        })
      });

      const mockRequest = new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'sig_mock'
        },
        body: JSON.stringify({
          id: eventId,
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'pi_test',
              metadata: { order_id: 'order_test_123' },
              amount: 1000,
              currency: 'aud'
            }
          }
        })
      });

      const { POST } = await import('../../routes/api/webhooks/stripe/+server');
      const response = await POST({ request: mockRequest } as any);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(result.status).toBe('processing');
    });
  });

  describe('Order-Level Idempotency', () => {
    it('should prevent duplicate payment processing for same order', async () => {
      const eventId = 'evt_test_order_duplicate_123';
      const orderId = 'order_test_123';
      
      // Mock event doesn't exist check
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null
        })
      });

      // Mock successful event insertion
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null })
      });

      // Mock order already has successful payment event
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: [{
            event_id: 'evt_previous_success',
            processed_at: new Date().toISOString(),
            error_message: null
          }],
          error: null
        })
      });

      // Mock marking current event as duplicate
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      });

      const mockRequest = new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'sig_mock'
        },
        body: JSON.stringify({
          id: eventId,
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'pi_test',
              metadata: { order_id: orderId },
              amount: 1000,
              currency: 'aud'
            }
          }
        })
      });

      const { POST } = await import('../../routes/api/webhooks/stripe/+server');
      const response = await POST({ request: mockRequest } as any);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(result.status).toBe('order_already_processed');
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle advisory lock acquisition failure gracefully', async () => {
      const eventId = 'evt_test_lock_failure_123';
      const orderId = 'order_test_123';
      
      // Mock event doesn't exist
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      // Mock successful event insertion
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null })
      });

      // Mock no order-specific duplicates
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({ data: [], error: null })
      });

      // Mock lock acquisition failure
      mockSupabase.rpc.mockResolvedValueOnce({ data: false, error: null });

      // Mock order fetch
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            state: 'pending_payment',
            stripe_payment_intent_id: null,
            version: 0
          },
          error: null
        })
      });

      // Mock successful update despite lock failure
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [{ id: orderId, state: 'paid' }],
          error: null
        })
      });

      // Mock payment upsert
      mockSupabase.from.mockReturnValueOnce({
        upsert: vi.fn().mockResolvedValue({ error: null })
      });

      const mockRequest = new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'sig_mock'
        },
        body: JSON.stringify({
          id: eventId,
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'pi_test',
              metadata: { order_id: orderId },
              amount: 1000,
              currency: 'aud'
            }
          }
        })
      });

      const { POST } = await import('../../routes/api/webhooks/stripe/+server');
      const response = await POST({ request: mockRequest } as any);

      expect(response.status).toBe(200);
    });

    it('should detect and handle optimistic locking conflicts', async () => {
      const eventId = 'evt_test_version_conflict_123';
      const orderId = 'order_test_123';
      
      // Mock event doesn't exist
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      // Mock successful event insertion
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null })
      });

      // Mock no order-specific duplicates
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({ data: [], error: null })
      });

      // Mock successful lock
      mockSupabase.rpc.mockResolvedValueOnce({ data: true, error: null });

      // Mock order fetch
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            state: 'pending_payment',
            stripe_payment_intent_id: null,
            version: 0
          },
          error: null
        })
      });

      // Mock update failure (no rows updated - version conflict)
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [], // No rows updated
          error: null
        })
      });

      // Mock verification check shows order is already paid
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            state: 'paid',
            stripe_payment_intent_id: 'pi_test'
          },
          error: null
        })
      });

      const mockRequest = new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'sig_mock'
        },
        body: JSON.stringify({
          id: eventId,
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'pi_test',
              metadata: { order_id: orderId },
              amount: 1000,
              currency: 'aud'
            }
          }
        })
      });

      const { POST } = await import('../../routes/api/webhooks/stripe/+server');
      const response = await POST({ request: mockRequest } as any);

      expect(response.status).toBe(200);
    });
  });

  describe('State Transition Validation', () => {
    it('should prevent invalid state transitions', async () => {
      const eventId = 'evt_test_invalid_transition_123';
      const orderId = 'order_test_123';
      
      // Mock event doesn't exist
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      // Mock successful event insertion
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null })
      });

      // Mock no order-specific duplicates
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({ data: [], error: null })
      });

      // Mock successful lock
      mockSupabase.rpc.mockResolvedValueOnce({ data: true, error: null });

      // Mock order in final state
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            state: 'refunded', // Final state
            stripe_payment_intent_id: 'pi_other',
            version: 1
          },
          error: null
        })
      });

      const mockRequest = new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'sig_mock'
        },
        body: JSON.stringify({
          id: eventId,
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'pi_test',
              metadata: { order_id: orderId },
              amount: 1000,
              currency: 'aud'
            }
          }
        })
      });

      const { POST } = await import('../../routes/api/webhooks/stripe/+server');
      const response = await POST({ request: mockRequest } as any);

      expect(response.status).toBe(200);
    });

    it('should handle different payment intent conflicts', async () => {
      const eventId = 'evt_test_different_pi_123';
      const orderId = 'order_test_123';
      
      // Mock event doesn't exist
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      // Mock successful event insertion
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null })
      });

      // Mock no order-specific duplicates
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({ data: [], error: null })
      });

      // Mock successful lock
      mockSupabase.rpc.mockResolvedValueOnce({ data: true, error: null });

      // Mock order with different payment intent
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            state: 'pending_payment',
            stripe_payment_intent_id: 'pi_different',
            version: 0
          },
          error: null
        })
      });

      const mockRequest = new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'sig_mock'
        },
        body: JSON.stringify({
          id: eventId,
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'pi_test',
              metadata: { order_id: orderId },
              amount: 1000,
              currency: 'aud'
            }
          }
        })
      });

      const { POST } = await import('../../routes/api/webhooks/stripe/+server');
      const response = await POST({ request: mockRequest } as any);

      expect(response.status).toBe(500);
    });
  });

  describe('Database Insert Race Conditions', () => {
    it('should handle unique constraint violations during event insertion', async () => {
      const eventId = 'evt_test_race_insert_123';
      
      // Mock event doesn't exist
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      // Mock unique constraint violation during insertion (race condition)
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({
          error: { code: '23505', message: 'duplicate key value violates unique constraint' }
        })
      });

      const mockRequest = new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'sig_mock'
        },
        body: JSON.stringify({
          id: eventId,
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'pi_test',
              metadata: { order_id: 'order_test_123' },
              amount: 1000,
              currency: 'aud'
            }
          }
        })
      });

      const { POST } = await import('../../routes/api/webhooks/stripe/+server');
      const response = await POST({ request: mockRequest } as any);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(result.status).toBe('race_condition');
    });
  });
});