import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auctions helpers
vi.mock('$lib/auctions', () => ({
  canBidOnListing: vi.fn(async (userId: string, listingId: string) => ({ allowed: true, listing: { reserve_cents: 2000 } })),
  validateBidAmount: vi.fn((bidCents: number, currentCents: number, reserve?: number) => {
    if (bidCents < 1300) return { valid: false, reason: 'Minimum bid is $13.00', minimumBid: 1300 };
    if (reserve && bidCents < reserve) return { valid: false, reason: 'Bid must meet reserve price of $20.00', minimumBid: reserve };
    return { valid: true };
  }),
  getCurrentBid: vi.fn(async () => ({ success: true, bid: { amount_cents: 1200 } })),
  getBidHistory: vi.fn(async () => ({ success: true, bids: [{ id: 'b1', amount_cents: 1200 }] })),
  getUserBids: vi.fn(async () => ({ success: true, bids: [{ id: 'b2', amount_cents: 1500 }] })),
  isUserWinning: vi.fn(async () => ({ winning: true, bid: { id: 'b2', amount_cents: 1500 } })),
}));

describe('Bids API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated POST', async () => {
    const { POST } = await import('./+server');
    const locals = { getSession: async () => null } as any;
    const req = { json: async () => ({ listingId: 'l1', amount_cents: 1500 }) } as any;
    const res = await POST({ request: req, locals } as any);
    expect(res.status).toBe(401);
  });

  it('validates min increment and reserve', async () => {
    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ user: { id: 'u1' } }) } as any;
    const req = { json: async () => ({ listingId: 'l1', amount_cents: 1200 }) } as any;
    const res = await POST({ request: req, locals } as any);
    expect(res.status).toBe(400);
  });

  it('rejects ended auction via permission check', async () => {
    const auctions = await import('$lib/auctions');
    (auctions as any).canBidOnListing.mockResolvedValueOnce({ allowed: false, reason: 'Auction ended' });
    const { POST } = await import('./+server');
    const locals = { getSession: async () => ({ user: { id: 'u1' } }) } as any;
    const req = { json: async () => ({ listingId: 'l1', amount_cents: 2000 }) } as any;
    const res = await POST({ request: req, locals } as any);
    expect(res.status).toBe(400);
  });

  it('places bid via RPC when valid', async () => {
    const { POST } = await import('./+server');
    const locals = {
      getSession: async () => ({ user: { id: 'u1' } }),
      supabase: { rpc: vi.fn().mockResolvedValue({ data: { success: true, bid_id: 'b3', amount_cents: 2000 }, error: null }) }
    } as any;
    const req = { json: async () => ({ listingId: 'l1', amount_cents: 2000 }) } as any;
    const res = await POST({ request: req, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.bid.id).toBe('b3');
  });

  it('GET current returns current bid', async () => {
    const { GET } = await import('./+server');
    const locals = { getSession: async () => ({ user: { id: 'u1' } }) } as any;
    const url = new URL('http://localhost/api/bids?action=current&listingId=l1');
    const res = await GET({ url, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.bid.amount_cents).toBe(1200);
  });
});


