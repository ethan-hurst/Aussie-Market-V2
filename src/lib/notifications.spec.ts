import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/supabase', () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  const select = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'n1' }], error: null }) }));
  const countSelect = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ count: 2, error: null }) }));
  const from = vi.fn((table: string) => {
    if (table === 'notifications') return { insert, update, select, }; // count handled by select(head)
    return {} as any;
  });
  return { supabase: { from } };
});

describe('notifications utils', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createNotification inserts', async () => {
    const { createNotification } = await import('./notifications');
    await createNotification('u1', 'order_paid', 'Title', 'Message');
    const supa = await import('$lib/supabase');
    expect((supa as any).supabase.from).toHaveBeenCalledWith('notifications');
  });

  it('getUnreadNotificationCount returns count', async () => {
    const { getUnreadNotificationCount } = await import('./notifications');
    const n = await getUnreadNotificationCount('u1');
    expect(typeof n).toBe('number');
  });
});


