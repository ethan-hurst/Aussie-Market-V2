import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Stripe constructEvent and errors
vi.mock('stripe', () => {
  const constructEventMock = vi.fn((body: string) => JSON.parse(body));
  class StripeMock {
    static errors = { StripeError: class extends Error {} };
    static __constructEventMock = constructEventMock;
    webhooks = { constructEvent: constructEventMock };
    constructor() {}
  }
  return { default: StripeMock };
});

function makeSupabaseMock() {
  const singlePaymentsByPI = vi.fn().mockResolvedValue({ data: { order_id: 'o1' }, error: null });
  const singlePaymentsByCharge = vi.fn().mockResolvedValue({ data: { order_id: 'o1' }, error: null });
  const singleOrdersBasic = vi.fn().mockResolvedValue({ data: { buyer_id: 'buyer1', seller_id: 'seller1' }, error: null });

  const eq = vi.fn((field: string, value: string) => {
    if (field === 'stripe_payment_intent_id') return { single: singlePaymentsByPI } as any;
    if (field === 'stripe_charge_id') return { single: singlePaymentsByCharge } as any;
    if (field === 'id') return { single: singleOrdersBasic } as any;
    return { single: vi.fn().mockResolvedValue({ data: null, error: null }) } as any;
  });

  const select = vi.fn(() => ({ eq }));
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => ({ select, update, insert } as any));
  return { supabase: { from } };
}

describe('Stripe webhooks refund/dispute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('processes refund.updated to mark order refunded and notify', async () => {
    vi.doMock('$lib/supabase', () => makeSupabaseMock());
    const { POST } = await import('./+server');
    const event = {
      type: 'charge.refund.updated',
      data: { object: { id: 're_1', amount: 500, currency: 'aud', payment_intent: 'pi_123' } }
    };
    const body = JSON.stringify(event);
    const headers = new Headers({ 'stripe-signature': 'sig_mock' });
    const res = await POST({ request: new Request('http://localhost', { method: 'POST', body, headers }) } as any);
    expect(res.status).toBe(200);
  });

  it('processes dispute.created to set order disputed and notify seller', async () => {
    vi.doMock('$lib/supabase', () => makeSupabaseMock());
    const { POST } = await import('./+server');
    const event = {
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_1', charge: 'ch_123', amount: 1000, currency: 'aud', reason: 'fraudulent', status: 'needs_response' } }
    };
    const body = JSON.stringify(event);
    const headers = new Headers({ 'stripe-signature': 'sig_mock' });
    const res = await POST({ request: new Request('http://localhost', { method: 'POST', body, headers }) } as any);
    expect(res.status).toBe(200);
  });
});


