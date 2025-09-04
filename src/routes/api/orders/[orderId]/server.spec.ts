import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock notifications
vi.mock('$lib/notifications', () => ({
  notifyOrderShipped: vi.fn().mockResolvedValue(undefined),
  notifyOrderDelivered: vi.fn().mockResolvedValue(undefined)
}));

// Mock Supabase for select and updates
vi.mock('$lib/supabase', () => {
  const single = vi.fn().mockResolvedValue({ data: { id: 'o1', buyer_id: 'buyer1', seller_id: 'seller1', state: 'paid', amount_cents: 1000 }, error: null });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => ({ select, update, insert } as any));
  return { supabase: { from } };
});

describe('Orders actions API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mark_ready by seller when paid', async () => {
    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } as any;
    const req = { json: async () => ({ action: 'mark_ready' }) } as any;
    const res = await POST({ params: { orderId: 'o1' }, request: req, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('ready_for_handover');
  });

  it('mark_shipped by seller when ready_for_handover', async () => {
    // Override single to return ready_for_handover state
    const supa = await import('$lib/supabase');
    (supa as any).supabase.from().select().eq().single.mockResolvedValueOnce({ data: { id: 'o1', buyer_id: 'buyer1', seller_id: 'seller1', state: 'ready_for_handover' }, error: null });
    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } as any;
    const req = { json: async () => ({ action: 'mark_shipped' }) } as any;
    const res = await POST({ params: { orderId: 'o1' }, request: req, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('shipped');
  });

  it('confirm_delivery by buyer when shipped', async () => {
    const supa = await import('$lib/supabase');
    (supa as any).supabase.from().select().eq().single.mockResolvedValueOnce({ data: { id: 'o1', buyer_id: 'buyer1', seller_id: 'seller1', state: 'shipped' }, error: null });
    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'buyer1' } } } }) } as any;
    const req = { json: async () => ({ action: 'confirm_delivery' }) } as any;
    const res = await POST({ params: { orderId: 'o1' }, request: req, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('delivered');
  });

  it('GET forbids viewing if not buyer or seller', async () => {
    const { GET } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'stranger' } } } }) } as any;
    const res = await GET({ params: { orderId: 'o1' }, locals } as any);
    expect(res.status).toBe(403);
  });

  it('mark_ready forbidden if state not paid', async () => {
    const supa = await import('$lib/supabase');
    (supa as any).supabase.from('orders').select().eq().single.mockResolvedValueOnce({ data: { id: 'o1', buyer_id: 'buyer1', seller_id: 'seller1', state: 'pending' }, error: null });
    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } as any;
    const req = { json: async () => ({ action: 'mark_ready' }) } as any;
    const res = await POST({ params: { orderId: 'o1' }, request: req, locals } as any);
    expect(res.status).toBe(403);
  });

  it('cancel by buyer or seller when unpaid or paid', async () => {
    const supa = await import('$lib/supabase');
    (supa as any).supabase.from().select().eq().single.mockResolvedValueOnce({ data: { id: 'o1', buyer_id: 'buyer1', seller_id: 'seller1', state: 'pending' }, error: null });
    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'buyer1' } } } }) } as any;
    const req = { json: async () => ({ action: 'cancel' }) } as any;
    const res = await POST({ params: { orderId: 'o1' }, request: req, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('cancelled');
  });
});