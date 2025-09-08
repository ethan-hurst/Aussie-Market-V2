import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase for auction and order creation flows
vi.mock('$lib/supabase', () => {
  // auctions select -> single
  const auctionSingle = vi.fn().mockResolvedValue({
    data: {
      id: 'a1',
      listing_id: 'l1',
      listings: { seller_id: 's1' },
      bids: [{ id: 'b1', bidder_id: 'u1', amount_cents: 5000 }]
    },
    error: null
  });
  const auctionsEq2 = vi.fn(() => ({ single: auctionSingle }));
  const auctionsEq1 = vi.fn(() => ({ eq: auctionsEq2 }));
  const auctionsSelect = vi.fn(() => ({ eq: auctionsEq1 }));

  // orders insert -> select -> single
  const ordersInsertSelectSingle = vi.fn().mockResolvedValue({ data: { id: 'o1', amount_cents: 5000 }, error: null });
  const ordersInsert = vi.fn(() => ({ select: () => ({ single: ordersInsertSelectSingle }) }));

  // orders select -> eq -> single (for createPaymentIntentForOrder)
  const ordersSelectSingle = vi.fn().mockResolvedValue({
    data: {
      id: 'o1',
      amount_cents: 5000,
      buyer: { email: 'buyer@example.com' },
      listing: { title: 'Test Item' }
    },
    error: null
  });
  const ordersSelectEq = vi.fn(() => ({ single: ordersSelectSingle }));
  const ordersSelect = vi.fn(() => ({ eq: ordersSelectEq }));

  // payments insert -> select -> single
  const paymentsInsertSelectSingle = vi.fn().mockResolvedValue({ data: { id: 'pay1' }, error: null });
  const paymentsInsert = vi.fn(() => ({ select: () => ({ single: paymentsInsertSelectSingle }) }));

  const from = vi.fn((table: string) => {
    if (table === 'auctions') return { select: auctionsSelect } as any;
    if (table === 'orders') return { 
      insert: ordersInsert,
      select: ordersSelect
    } as any;
    if (table === 'payments') return { insert: paymentsInsert } as any;
    return {} as any;
  });
  return { supabase: { from } };
});

describe('createOrderFromAuction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates order and payment when auction ended with winning bid', async () => {
    const { createOrderFromAuction } = await import('./orders');
    const order = await createOrderFromAuction('a1');
    expect(order).not.toBeNull();
    expect(order?.id).toBe('o1');
  });
});


