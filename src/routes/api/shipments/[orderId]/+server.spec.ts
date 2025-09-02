import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/supabase', () => {
  const ordersSingle = vi.fn().mockResolvedValue({ data: { id: 'o1', seller_id: 'seller1', state: 'paid' }, error: null });
  const ordersEq = vi.fn(() => ({ single: ordersSingle }));
  const ordersSelect = vi.fn(() => ({ eq: ordersEq }));
  const ordersUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const ordersUpdate = vi.fn(() => ({ eq: ordersUpdateEq }));

  const shipmentsUpsertSingle = vi.fn().mockResolvedValue({ data: { id: 'sh1', order_id: 'o1', carrier: 'AUSPOST', tracking: 'T123' }, error: null });
  const shipmentsUpsert = vi.fn(() => ({ select: () => ({ single: shipmentsUpsertSingle }) }));

  const from = vi.fn((table: string) => {
    if (table === 'orders') return { select: ordersSelect, update: ordersUpdate } as any;
    if (table === 'shipments') return { upsert: shipmentsUpsert } as any;
    return {} as any;
  });
  return { supabase: { from } };
});

describe('Shipments API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires auth', async () => {
    const { POST } = await import('./+server');
    const res = await POST({ params: { orderId: 'o1' }, request: new Request('http://localhost', { method: 'POST', body: '{}' }), locals: { getSession: async () => ({ data: { session: null } }) } } as any);
    expect(res.status).toBe(401);
  });

  it('saves shipment and marks order shipped for seller', async () => {
    const { POST } = await import('./+server');
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ carrier: 'AUSPOST', tracking: 'T123', label_url: 'http://label' }) });
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } as any;
    const res = await POST({ params: { orderId: 'o1' }, request: req, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.shipment.carrier).toBe('AUSPOST');
  });

  it('forbids non-seller from creating shipment', async () => {
    const { POST } = await import('./+server');
    // Override order to belong to another seller
    const supa = await import('$lib/supabase');
    (supa as any).supabase.from('orders').select().eq().single.mockResolvedValueOnce({ data: { id: 'o1', seller_id: 'seller2', state: 'paid' }, error: null });
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ carrier: 'AUSPOST', tracking: 'T123' }) });
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } as any;
    const res = await POST({ params: { orderId: 'o1' }, request: req, locals } as any);
    expect(res.status).toBe(403);
  });
});


