import { render, screen, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock subscription manager to capture unsubscribe and trigger connection status
vi.mock('$lib/subscriptionManager', () => {
  const subscribeToAuctionWithManager = vi.fn((auctionId: string, callbacks: any) => {
    // Immediately report connected so the UI reflects "Live"
    callbacks.onConnectionStatus?.('connected');
    return 'sub-123';
  });
  const unsubscribeFromAuction = vi.fn();
  return { subscribeToAuctionWithManager, unsubscribeFromAuction };
});

// Mock supabase auth session
vi.mock('$lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } }))
    }
  }
}));

// Mock auctions helpers used by component
vi.mock('$lib/auctions', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getMinimumBid: vi.fn(async () => 1100),
    placeBid: vi.fn(async () => ({ success: true }))
  };
});

describe.skip('LiveAuction component - subscription integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes on mount and unsubscribes on destroy', async () => {
    const LiveAuction = (await import('./LiveAuction.svelte')).default;
    const { component } = render(LiveAuction, {
      props: {
        auctionId: 'a1',
        listingEndAt: new Date(Date.now() + 60_000).toISOString(),
        currentPriceCents: 1000,
        bidCount: 0,
        highBidderId: null,
        reserveMet: false,
        reserveCents: null
      }
    });

    // Verify subscription invoked with expected auction id
    const manager = await import('$lib/subscriptionManager');
    expect((manager as any).subscribeToAuctionWithManager).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ onConnectionStatus: expect.any(Function) })
    );

    // Destroy component -> should unsubscribe
    component.$destroy();
    expect((manager as any).unsubscribeFromAuction).toHaveBeenCalledWith('sub-123');
  });
});


