import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/supabase', () => {
  const shipSingle = vi.fn().mockResolvedValue({ data: { id: 'sh1' }, error: null });
  const shipEq = vi.fn(() => ({ single: shipSingle }));
  const shipSelect = vi.fn(() => ({ eq: shipEq }));

  const eventsOrder = vi.fn().mockResolvedValue({ data: [{ id: 'e1', status: 'in_transit' }], error: null });
  const eventsEq = vi.fn(() => ({ order: () => eventsOrder }));
  const eventsSelect = vi.fn(() => ({ eq: eventsEq }));

  const eventsInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'e2', status: 'delivered' }, error: null });
  const eventsInsert = vi.fn(() => ({ select: () => ({ single: eventsInsertSingle }) }));

  const from = vi.fn((table: string) => {
    if (table === 'shipments') return { select: shipSelect } as any;
    if (table === 'shipment_events') return { select: eventsSelect, insert: eventsInsert } as any;
    return {} as any;
  });
  return { supabase: { from } };
});

describe('Shipment Events API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET lists events', async () => {
    const { GET } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } as any;
    const res = await GET({ params: { orderId: 'o1' }, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
  });

  it('POST adds event for seller', async () => {
    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } as any;
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ status: 'delivered' }) });
    const res = await POST({ params: { orderId: 'o1' }, request: req, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});