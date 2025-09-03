import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase channel API
const subscribeMock = vi.fn(() => ({ unsubscribe: vi.fn() }));
const onMock = vi.fn(() => ({ subscribe: subscribeMock }));
vi.mock('$lib/supabase', () => ({ supabase: { channel: vi.fn(() => ({ on: onMock, subscribe: subscribeMock })) } }));

// Avoid real network to supabase in helpers
vi.mock('./auctions', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getAuctionWithBids: vi.fn(async () => ({ id: 'a1', current_price_cents: 1200, high_bid_id: 'b1', bids: [], listings: { end_at: new Date(Date.now() + 60_000).toISOString() }, status: 'live' })),
  };
});

describe('auctions realtime subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribeToAuction registers bid and auction listeners and subscribes', async () => {
    const { subscribeToAuction } = await import('./auctions');
    const callbacks = {
      onUpdate: vi.fn(),
      onBid: vi.fn(),
      onStatusChange: vi.fn(),
      onConnectionStatus: vi.fn(),
    };
    const cleanup = subscribeToAuction('a1', callbacks);
    expect(onMock).toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalled();
    expect(typeof cleanup).toBe('function');
  });
});


