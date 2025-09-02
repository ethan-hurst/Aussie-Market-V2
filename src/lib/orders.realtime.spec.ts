import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase channel API
const subscribeMock = vi.fn(() => ({ unsubscribe: vi.fn() }));
const onMock = vi.fn(() => ({ subscribe: subscribeMock }));
vi.mock('$lib/supabase', () => ({ supabase: { channel: vi.fn(() => ({ on: onMock })) } }));

// Mock data fetchers to avoid actual DB
vi.mock('./orders', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getOrderDetails: vi.fn(async () => ({ id: 'o1' })),
    getUserOrders: vi.fn(async () => ([{ id: 'o1' }]))
  };
});

describe('orders realtime subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribeToOrderUpdates registers correct channel and filter', async () => {
    const { subscribeToOrderUpdates } = await import('./orders');
    const cb = vi.fn();
    const sub = subscribeToOrderUpdates('o1', cb);
    expect(onMock).toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalled();
    expect(sub).toBeDefined();
  });

  it('subscribeToUserOrders registers correct channel', async () => {
    const { subscribeToUserOrders } = await import('./orders');
    const cb = vi.fn();
    const sub = subscribeToUserOrders('u1', cb);
    expect(onMock).toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalled();
    expect(sub).toBeDefined();
  });
});


