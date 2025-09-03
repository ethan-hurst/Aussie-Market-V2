import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
vi.mock('$lib/security', () => ({ rateLimit: () => ({ allowed: true }) }));
vi.mock('$lib/validation', () => ({ validate: (schema: any, data: any) => ({ ok: true, value: data }) }));
vi.mock('$lib/errors', () => ({ mapApiErrorToMessage: (e: any) => (e?.error || e?.message || String(e)) }));
vi.mock('$lib/auctions', () => ({
  canBidOnListing: vi.fn().mockResolvedValue({ allowed: true, listing: { reserve_cents: null } }),
  validateBidAmount: vi.fn().mockReturnValue({ valid: true, minimumBid: 0 }),
  getCurrentBid: vi.fn().mockResolvedValue({ success: true, bid: null }),
  getBidHistory: vi.fn(),
  getUserBids: vi.fn(),
  isUserWinning: vi.fn()
}));

// Supabase RPC mock with a simple concurrency gate
const rpcState = { taken: false };
vi.mock('$lib/supabase', () => ({ supabase: {} }));

describe('POST /api/bids concurrency', () => {
  beforeEach(() => { rpcState.taken = false; vi.clearAllMocks(); });

  it('only one of two parallel identical bids succeeds', async () => {
    const { POST } = await import('./+server');

    // Locals with RPC that succeeds once then returns a lower-bid style error
    const locals: any = {
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
      supabase: {
        rpc: vi.fn().mockImplementation(async (_fn: string, _args: any) => {
          if (!rpcState.taken) {
            rpcState.taken = true;
            return { data: JSON.stringify({ success: true, bid_id: 'b1', amount_cents: 2000 }), error: null };
          }
          return { data: JSON.stringify({ success: false, error: 'Bid must be higher than current bid' }), error: null };
        })
      }
    };

    const body = { listingId: 'l1', amount_cents: 2000 };
    const reqA: any = { json: async () => body };
    const reqB: any = { json: async () => body };

    // Fire concurrently
    const [resA, resB] = await Promise.all([
      POST({ request: reqA, locals } as any),
      POST({ request: reqB, locals } as any)
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 400]);
  });
});


