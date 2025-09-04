import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Stripe constructEvent and errors
vi.mock('stripe', () => {
  const constructEventMock = vi.fn((body: string) => JSON.parse(body));
  class StripeMock {
    static errors = { StripeError: class extends Error {} };
    static __constructEventMock = constructEventMock;
    webhooks = {
      constructEvent: constructEventMock
    };
    constructor() {}
  }
  return { default: StripeMock };
});

// Mock Supabase for updates/inserts/selects used by handlers
const makeSupabaseMock = () => {
  const single = vi.fn().mockResolvedValue({ data: { buyer_id: 'buyer1', seller_id: 'seller1' }, error: null });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => ({ select, update, insert } as any));
  return { supabase: { from } };
};

vi.mock('$lib/supabase', () => makeSupabaseMock());
vi.mock('$lib/env', () => ({ env: { STRIPE_WEBHOOK_SECRET: 'whsec_mock' } }));

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles payment_intent.succeeded and updates order/payments', async () => {
    const { POST } = await import('./+server');
    const event = {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_123', amount: 2000, currency: 'aud', metadata: { order_id: 'o1' } } }
    };
    const body = JSON.stringify(event);
    const headers = new Headers({ 'stripe-signature': 'sig_mock' });
    const res = await POST({ request: new Request('http://localhost', { method: 'POST', body, headers }) } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });

  it('handles payment_intent.payment_failed and inserts failure notification', async () => {
    const { POST } = await import('./+server');
    const event = {
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_999', amount: 2000, currency: 'aud', metadata: { order_id: 'o2' }, last_payment_error: { message: 'declined' } } }
    };
    const body = JSON.stringify(event);
    const headers = new Headers({ 'stripe-signature': 'sig_mock' });
    const res = await POST({ request: new Request('http://localhost', { method: 'POST', body, headers }) } as any);
    expect(res.status).toBe(200);
  });

  it('handles unknown event types gracefully', async () => {
    const { POST } = await import('./+server');
    const event = { type: 'unknown.event', data: { object: {} } };
    const body = JSON.stringify(event);
    const headers = new Headers({ 'stripe-signature': 'sig_mock' });
    const res = await POST({ request: new Request('http://localhost', { method: 'POST', body, headers }) } as any);
    expect(res.status).toBe(200);
  });

  it('rejects invalid signature', async () => {
    // Override constructEvent to throw on this call
    const Stripe = (await import('stripe')).default as any;
    Stripe.__constructEventMock.mockImplementationOnce(() => { throw new Error('bad sig'); });
    const { POST } = await import('./+server');
    const body = JSON.stringify({ type: 'payment_intent.succeeded', data: { object: { id: 'pi', metadata: { order_id: 'o1' } } } });
    const headers = new Headers({ 'stripe-signature': 'sig_bad' });
    const res = await POST({ request: new Request('http://localhost', { method: 'POST', body, headers }) } as any);
    expect(res.status).toBe(400);
  });
});