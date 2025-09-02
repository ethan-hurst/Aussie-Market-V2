import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
vi.mock('$lib/supabase', () => {
  const selectSingleOrder = vi.fn().mockResolvedValue({ data: { id: 'o1', buyer_id: 'buyer1', seller_id: 'seller1', state: 'paid' }, error: null });
  const ordersEq = vi.fn(() => ({ single: selectSingleOrder }));
  const ordersSelect = vi.fn(() => ({ eq: ordersEq }));
  const ordersUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const ordersUpdate = vi.fn(() => ({ eq: ordersUpdateEq }));

  const pickupsUpsertSelectSingle = vi.fn().mockResolvedValue({ data: { order_id: 'o1' }, error: null });
  const pickupsUpsert = vi.fn(() => ({ select: () => ({ single: pickupsUpsertSelectSingle }) }));
  const pickupsSelectSingle = vi.fn().mockResolvedValue({ data: { order_id: 'o1', code6_hash: 'hash', qr_token: 'qr' }, error: null });
  const pickupsEq = vi.fn(() => ({ single: pickupsSelectSingle }));
  const pickupsSelect = vi.fn(() => ({ eq: pickupsEq }));
  const pickupsUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const pickupsUpdate = vi.fn(() => ({ eq: pickupsUpdateEq }));

  const from = vi.fn((table: string) => {
    if (table === 'orders') return { select: ordersSelect, update: ordersUpdate } as any;
    if (table === 'pickups') return { upsert: pickupsUpsert, select: pickupsSelect, update: pickupsUpdate } as any;
    return {} as any;
  });
  return { supabase: { from } };
});

// Mock crypto to make code6 hash predictable
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    randomUUID: () => 'qr-fixed',
    createHash: () => ({ update: () => ({ digest: () => 'hash' }) })
  };
});

describe('Pickup API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires auth', async () => {
    const { POST } = await import('./+server');
    const res = await POST({ params: { orderId: 'o1' }, request: new Request('http://localhost', { method: 'POST', body: '{}' }), locals: { getSession: async () => ({ data: { session: null } }) } } as any);
    expect(res.status).toBe(401);
  });

  it('init generates code and qr for seller', async () => {
    const { POST } = await import('./+server');
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ action: 'init' }) });
    const res = await POST({ params: { orderId: 'o1' }, request: req, locals: { getSession: async () => ({ data: { session: { user: { id: 'seller1' } } } }) } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.qr_token).toBeDefined();
    expect(body.code6).toBeDefined();
  });

  it('redeem succeeds with valid token', async () => {
    const { POST } = await import('./+server');
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ action: 'redeem', qr_token: 'qr' }) });
    const res = await POST({ params: { orderId: 'o1' }, request: req, locals: { getSession: async () => ({ data: { session: { user: { id: 'buyer1' } } } }) } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.state).toBe('delivered');
  });
});


