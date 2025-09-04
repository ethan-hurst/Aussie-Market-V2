import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Stripe before importing the handler
vi.mock('stripe', () => {
  const retrieveMock = vi.fn().mockResolvedValue({ id: 'pi_123', status: 'succeeded' });
  class StripeMock {
    paymentIntents = {
      retrieve: retrieveMock
    };
    static errors = { StripeError: class extends Error {} };
    static __retrieveMock = retrieveMock;
    constructor() {}
  }
  return { default: StripeMock };
});

// Mock notifications
vi.mock('$lib/notifications', () => ({
  notifyOrderPaid: vi.fn().mockResolvedValue(undefined)
}));

// Mock Supabase
vi.mock('$lib/supabase', () => {
  // For select * from orders where id=... single()
  const single = vi.fn().mockResolvedValue({
    data: {
      id: 'o1',
      buyer_id: 'user1',
      seller_id: 'user2',
      total_amount_cents: 1234
    },
    error: null
  });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));

  // For updates and inserts
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const insert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === 'orders') return { select, update } as any;
    if (table === 'payments') return { insert } as any;
    if (table === 'ledger_entries') return { insert } as any;
    return {} as any;
  });
  return { supabase: { from } };
});

// Mock env (optional)
vi.mock('$lib/env', () => ({ env: { STRIPE_SECRET_KEY: 'sk_test_mock' } }));

describe('POST /api/payments/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms a successful payment and updates records', async () => {
    const { POST } = await import('./+server');

    const locals = {
      getSession: async () => ({ data: { session: { user: { id: 'user1' } } } })
    } as any;

    const request = {
      json: async () => ({ orderId: 'o1', paymentIntentId: 'pi_123' })
    } as any;

    const res = await POST({ request, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.orderState).toBe('paid');
  });

  it('returns 401 for unauthenticated requests', async () => {
    const { POST } = await import('./+server');

    const locals = {
      getSession: async () => ({ data: { session: null } })
    } as any;

    const request = {
      json: async () => ({ orderId: 'o1', paymentIntentId: 'pi_123' })
    } as any;

    const res = await POST({ request, locals } as any);
    expect(res.status).toBe(401);
  });

  it('rejects if payment intent not succeeded', async () => {
    const Stripe = (await import('stripe')).default as any;
    Stripe.__retrieveMock.mockResolvedValueOnce({ id: 'pi_123', status: 'requires_payment_method' });
    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'user1' } } } }) } as any;
    const request = { json: async () => ({ orderId: 'o1', paymentIntentId: 'pi_123' }) } as any;
    const res = await POST({ request, locals } as any);
    expect(res.status).toBe(400);
  });
});