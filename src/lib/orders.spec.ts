import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as orders from './orders';

vi.mock('$lib/supabase', () => {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'o1', buyer_id: 'b1', seller_id: 's1' }, error: null }) })) }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update, select }));
  return {
    supabase: {
      from,
    }
  };
});

vi.mock('$lib/notifications', () => {
  return {
    notifyOrderShipped: vi.fn().mockResolvedValue(undefined),
    notifyOrderDelivered: vi.fn().mockResolvedValue(undefined)
  };
});

describe('orders helpers', () => {
  it('getOrderStatusColor returns classes', () => {
    expect(orders.getOrderStatusColor('paid')).toContain('blue');
    expect(orders.getOrderStatusColor('delivered')).toContain('green');
  });

  it('getOrderStatusLabel returns human labels', () => {
    expect(orders.getOrderStatusLabel('paid')).toBe('Payment Received');
    expect(orders.getOrderStatusLabel('refunded')).toBe('Refunded');
  });

  it('canPerformAction enforces basic roles', () => {
    const order: any = { id: 'o1', buyer_id: 'b1', seller_id: 's1', state: 'paid' };
    expect(orders.canPerformAction(order, 'b1', 'pay')).toBe(false);
    expect(orders.canPerformAction(order, 's1', 'mark_ready')).toBe(true);
    expect(orders.canPerformAction(order, 'b1', 'confirm_delivery')).toBe(false);
  });
});

describe('orders transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateOrderStateWithNotification triggers shipped notification', async () => {
    const { notifyOrderShipped } = await import('$lib/notifications');

    const ok = await orders.updateOrderStateWithNotification('o1', 'shipped', 's1', 'order_shipped');
    expect(ok).toBe(true);
    expect((notifyOrderShipped as any)).toHaveBeenCalledWith('o1', 'b1');
  });
});


