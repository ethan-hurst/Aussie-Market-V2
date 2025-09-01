import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Stripe before importing the handler
vi.mock('stripe', () => {
  class StripeMock {
    paymentIntents = {
      create: vi.fn().mockResolvedValue({ id: 'pi_123', client_secret: 'cs_123' })
    };
    static errors = { StripeError: class extends Error {} };
    constructor() {}
  }
  return { default: StripeMock };
});

// Mock Supabase
vi.mock('$lib/supabase', () => {
  const single = vi.fn().mockResolvedValue({
    data: {
      id: 'o1',
      buyer_id: 'user1',
      state: 'pending',
      buyer: { legal_name: 'Buyer Name', email: 'buyer@example.com' },
      listing: { title: 'Cool Item' }
    },
    error: null
  });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const from = vi.fn((table: string) => {
    return { select, update } as any;
  });
  return { supabase: { from } };
});

// Mock env (optional)
vi.mock('$lib/env', () => ({ env: { STRIPE_SECRET_KEY: 'sk_test_mock' } }));

describe('POST /api/payments/create-intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a payment intent and updates order', async () => {
    const { POST } = await import('./+server');

    const locals = {
      getSession: async () => ({ data: { session: { user: { id: 'user1' } } } })
    } as any;

    const request = {
      json: async () => ({ orderId: 'o1', amount: 1234, currency: 'aud' })
    } as any;

    const res = await POST({ request, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBe('cs_123');
    expect(body.paymentIntentId).toBe('pi_123');
  });

  it('returns 401 when not authenticated', async () => {
    const { POST } = await import('./+server');

    const locals = {
      getSession: async () => ({ data: { session: null } })
    } as any;

    const request = {
      json: async () => ({ orderId: 'o1', amount: 1234 })
    } as any;

    const res = await POST({ request, locals } as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });
});


