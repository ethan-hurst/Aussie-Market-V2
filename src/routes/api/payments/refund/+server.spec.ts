import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Stripe refunds
vi.mock('stripe', () => {
  const createMock = vi.fn().mockResolvedValue({ id: 're_123' });
  class StripeMock {
    refunds = { create: createMock };
    static errors = { StripeError: class extends Error {} };
    static __createRefundMock = createMock;
    constructor() {}
  }
  return { default: StripeMock };
});

// Mocks that we'll override in tests
const insertPayment = vi.fn().mockResolvedValue({ error: null });
const insertLedger = vi.fn().mockResolvedValue({ error: null });
const ordersUpdate = vi.fn().mockResolvedValue({ error: null });

// Mock Supabase
vi.mock('$lib/supabase', () => {
  const single = vi.fn().mockResolvedValue({ data: { id: 'o1', seller_id: 'seller1', stripe_payment_intent_id: 'pi_123', amount_cents: 2000 }, error: null });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    if (table === 'orders') return { select, update: ordersUpdate } as any;
    if (table === 'payments') return { insert: insertPayment } as any;
    if (table === 'ledger_entries') return { insert: insertLedger } as any;
    return {} as any;
  });
  return { supabase: { from } };
});

// Mock env
vi.mock('$lib/env', () => ({ env: { STRIPE_SECRET_KEY: 'sk_test_mock' } }));

describe('POST /api/payments/refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset supabase mock implementation to default for each test
    import('$lib/supabase').then((supa) => {
      (supa as any).supabase.from.mockImplementation((table: string) => {
        if (table === 'orders') {
          const single = vi.fn().mockResolvedValue({ data: { id: 'o1', seller_id: 'seller1', stripe_payment_intent_id: 'pi_123', amount_cents: 2000 }, error: null });
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) } as any;
        }
        if (table === 'payments') return { insert: insertPayment } as any;
        if (table === 'ledger_entries') return { insert: insertLedger } as any;
        return {} as any;
      });
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: null } }) } as any;
    const request = { json: async () => ({ orderId: 'o1' }) } as any;
    const res = await POST({ request, locals } as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 when requester is not the seller', async () => {
    // Override order seller_id to something else
    const supa = await import('$lib/supabase');
    const single = vi.fn().mockResolvedValue({ data: { id: 'o1', seller_id: 'another', stripe_payment_intent_id: 'pi_123', amount_cents: 2000 }, error: null });
    (supa as any).supabase.from.mockImplementationOnce((table: string) => {
      if (table === 'orders') return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) } as any;
      return (supa as any).supabase.from(table);
    });

    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } as any;
    const request = { json: async () => ({ orderId: 'o1' }) } as any;
    const res = await POST({ request, locals } as any);
    expect(res.status).toBe(403);
  });

  it('returns 404 when order not found', async () => {
    const supa = await import('$lib/supabase');
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    (supa as any).supabase.from.mockImplementationOnce((table: string) => {
      if (table === 'orders') return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) } as any;
      return (supa as any).supabase.from(table);
    });

    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } as any;
    const request = { json: async () => ({ orderId: 'missing' }) } as any;
    const res = await POST({ request, locals } as any);
    expect(res.status).toBe(404);
  });

  it('returns 400 when no payment intent on order', async () => {
    const supa = await import('$lib/supabase');
    const single = vi.fn().mockResolvedValue({ data: { id: 'o1', seller_id: 'seller1', stripe_payment_intent_id: null, amount_cents: 2000 }, error: null });
    (supa as any).supabase.from.mockImplementationOnce((table: string) => {
      if (table === 'orders') return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) } as any;
      return (supa as any).supabase.from(table);
    });

    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } as any;
    const request = { json: async () => ({ orderId: 'o1' }) } as any;
    const res = await POST({ request, locals } as any);
    expect(res.status).toBe(400);
  });

  it('creates a full refund and records it', async () => {
    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } as any;
    const request = { json: async () => ({ orderId: 'o1' }) } as any;
    const res = await POST({ request, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.refund_id).toBe('re_123');
    // Ensure payment and ledger inserts were attempted
    expect(insertPayment).toHaveBeenCalled();
    expect(insertLedger).toHaveBeenCalled();
  });

  it('creates a partial refund when amount is specified', async () => {
    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } as any;
    const request = { json: async () => ({ orderId: 'o1', amount_cents: 500 }) } as any;
    const res = await POST({ request, locals } as any);
    expect(res.status).toBe(200);
    // Check that payments insert used the partial amount
    const paymentArgs = insertPayment.mock.calls.at(-1)?.[0];
    expect(paymentArgs).toMatchObject({ amount_cents: 500 });
    const ledgerArgs = insertLedger.mock.calls.at(-1)?.[0];
    expect(ledgerArgs).toMatchObject({ amount_cents: 500 });
  });
});


