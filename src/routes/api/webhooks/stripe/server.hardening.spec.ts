import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Stripe constructEvent
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

describe('Stripe webhook hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects stale events beyond tolerance', async () => {
    await vi.resetModules();
    vi.useFakeTimers();
    const now = new Date('2025-01-01T00:00:00Z');
    vi.setSystemTime(now);

    // Event created 2 hours ago (> 5 min tolerance)
    const createdSec = Math.floor((now.getTime() - 2 * 60 * 60 * 1000) / 1000);

    // Supabase mock (not used in this test path)
    vi.doMock('$lib/supabase', () => ({ supabase: { from: vi.fn() } }));
    vi.doMock('$lib/env', () => ({ env: { STRIPE_WEBHOOK_SECRET: 'whsec_mock', STRIPE_SECRET_KEY: 'sk_test_x' } }));

    const { POST } = await import('./+server');
    const event = { id: 'evt_stale', type: 'payment_intent.succeeded', created: createdSec, data: { object: { id: 'pi', metadata: { order_id: 'o1' } } } } as any;
    const body = JSON.stringify(event);
    const headers = new Headers({ 'stripe-signature': 'sig_mock' });
    const res = await POST({ request: new Request('http://localhost', { method: 'POST', body, headers }) } as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Stale event');
  });

  it('is idempotent on duplicate event ids', async () => {
    await vi.resetModules();
    // In-memory store to simulate webhook_events table
    const eventStore = new Set<string>();

    const single = vi.fn();
    const eq = vi.fn((field: string, value: string) => {
      if (field === 'event_id') {
        return { single: vi.fn().mockResolvedValue({ data: eventStore.has(value) ? { event_id: value } : null, error: null }) } as any;
      }
      return { single: vi.fn().mockResolvedValue({ data: null, error: null }) } as any;
    });
    const select = vi.fn(() => ({ eq }));
    // Orders select chain used by handler (state check)
    const ordersSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { state: 'pending' }, error: null }) })) }));
    const insert = vi.fn(async (payload: any) => { if (payload?.event_id) eventStore.add(payload.event_id); return { error: null }; });
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const from = vi.fn((table: string) => {
      if (table === 'orders') return { select: ordersSelect, update } as any;
      return { select, insert, update } as any;
    });

    vi.doMock('$lib/supabase', () => ({ supabase: { from } }));
    vi.doMock('$lib/env', () => ({ env: { STRIPE_WEBHOOK_SECRET: 'whsec_mock', STRIPE_SECRET_KEY: 'sk_test_x' } }));

    const { POST } = await import('./+server');
    const event = { id: 'evt_123', type: 'payment_intent.succeeded', created: Math.floor(Date.now()/1000), data: { object: { id: 'pi_123', metadata: { order_id: 'o1' } } } } as any;
    const body = JSON.stringify(event);
    const headers = new Headers({ 'stripe-signature': 'sig_mock' });

    // First delivery
    let res = await POST({ request: new Request('http://localhost', { method: 'POST', body, headers }) } as any);
    expect(res.status).toBe(200);
    let json = await res.json();
    expect(json.received).toBe(true);

    // Replay duplicate
    res = await POST({ request: new Request('http://localhost', { method: 'POST', body, headers }) } as any);
    expect(res.status).toBe(200);
    json = await res.json();
    expect(json.idempotent).toBe(true);
  });

  it('does not downgrade order state on out-of-order failure after success', async () => {
    await vi.resetModules();
    // Simple in-memory order state tracker
    const orderState: Record<string, string> = { o1: 'pending' };

    let lastUpdatePayload: any = null;
    const update = vi.fn((payload: any) => {
      lastUpdatePayload = payload;
      return {
        eq: vi.fn((field: string, value: string) => {
          if (field === 'id') {
            orderState[value] = lastUpdatePayload?.state;
          }
          return Promise.resolve({ error: null });
        })
      } as any;
    });

    const select = vi.fn((columns?: string) => ({
      eq: vi.fn((field: string, value: string) => ({
        single: vi.fn().mockResolvedValue({ data: field === 'id' ? { state: orderState[value] } : null, error: null })
      }))
    }));

    const insert = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn((table: string) => {
      if (table === 'orders') {
        return { select, update } as any;
      }
      // webhook_events and others
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })) })), insert, update } as any;
    });

    vi.doMock('$lib/supabase', () => ({ supabase: { from } }));
    vi.doMock('$lib/env', () => ({ env: { STRIPE_WEBHOOK_SECRET: 'whsec_mock', STRIPE_SECRET_KEY: 'sk_test_x' } }));

    const { POST } = await import('./+server');
    const headers = new Headers({ 'stripe-signature': 'sig_mock' });

    // Success event first
    const successEvent = { id: 'evt_succ', type: 'payment_intent.succeeded', created: Math.floor(Date.now()/1000), data: { object: { id: 'pi_ok', amount: 2000, currency: 'aud', metadata: { order_id: 'o1' } } } } as any;
    let res = await POST({ request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(successEvent), headers }) } as any);
    expect(res.status).toBe(200);
    expect(orderState.o1).toBe('paid');

    // Failure arrives later (out-of-order)
    const failedEvent = { id: 'evt_fail', type: 'payment_intent.payment_failed', created: Math.floor(Date.now()/1000), data: { object: { id: 'pi_ok', amount: 2000, currency: 'aud', metadata: { order_id: 'o1' }, last_payment_error: { message: 'declined' } } } } as any;
    res = await POST({ request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(failedEvent), headers }) } as any);
    expect(res.status).toBe(200);
    // Should remain paid
    expect(orderState.o1).toBe('paid');
  });
});