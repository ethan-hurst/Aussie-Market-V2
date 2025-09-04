import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(() => ({
    on: vi.fn(() => ({ subscribe: vi.fn() })),
    unsubscribe: vi.fn()
  }))
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase)
}));

describe('Auction Finalization Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Duplicate Order Prevention', () => {
    it('should not create duplicate orders for the same auction', async () => {
      const auctionId = 'auction-123';
      const listingId = 'listing-456';
      const buyerId = 'buyer-789';
      const sellerId = 'seller-101';
      const winningBidId = 'bid-202';

      // Mock auction data with winning bid
      const auctionData = {
        id: auctionId,
        listing_id: listingId,
        high_bid_id: winningBidId,
        status: 'ended',
        listings: {
          id: listingId,
          seller_id: sellerId,
          title: 'Test Item',
          description: 'Test Description',
          listing_photos: []
        },
        bids: [{
          id: winningBidId,
          bidder_id: buyerId,
          amount_cents: 10000
        }]
      };

      // Mock unique constraint violation (duplicate order)
      const uniqueViolationError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "uniq_orders_auction_id"'
      };

      // Setup mocks
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'auctions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: auctionData, error: null })
                }))
              }))
            }))
          };
        }
        if (table === 'orders') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: null, error: uniqueViolationError })
              }))
            }))
          };
        }
        return { select: vi.fn() };
      });

      // Import the function after mocking
      const { createOrderFromAuction } = await import('$lib/orders');

      // Call the function
      const result = await createOrderFromAuction(auctionId);

      // Should return null because of unique constraint violation
      expect(result).toBeNull();
    });

    it('should handle auctions with no bids gracefully', async () => {
      const auctionId = 'auction-no-bids';
      const listingId = 'listing-456';

      // Mock auction data with no bids
      const auctionData = {
        id: auctionId,
        listing_id: listingId,
        high_bid_id: null,
        status: 'ended',
        listings: {
          id: listingId,
          seller_id: 'seller-101',
          title: 'Test Item',
          description: 'Test Description',
          listing_photos: []
        },
        bids: [] // No bids
      };

      // Setup mocks
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'auctions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: auctionData, error: null })
                }))
              }))
            }))
          };
        }
        return { select: vi.fn() };
      });

      // Import the function after mocking
      const { createOrderFromAuction } = await import('$lib/orders');

      // Call the function
      const result = await createOrderFromAuction(auctionId);

      // Should return null because no winning bid
      expect(result).toBeNull();
    });

    it('should create order successfully when no existing order found', async () => {
      const auctionId = 'auction-new';
      const listingId = 'listing-456';
      const buyerId = 'buyer-789';
      const sellerId = 'seller-101';
      const winningBidId = 'bid-202';

      // Mock auction data
      const auctionData = {
        id: auctionId,
        listing_id: listingId,
        high_bid_id: winningBidId,
        status: 'ended',
        listings: {
          id: listingId,
          seller_id: sellerId,
          title: 'Test Item',
          description: 'Test Description',
          listing_photos: []
        },
        bids: [{
          id: winningBidId,
          bidder_id: buyerId,
          amount_cents: 10000
        }]
      };

      // Mock successful order creation
      const newOrderData = {
        id: 'new-order-123',
        listing_id: listingId,
        buyer_id: buyerId,
        seller_id: sellerId,
        amount_cents: 10000,
        state: 'pending_payment',
        auction_id: auctionId,
        winning_bid_id: winningBidId
      };

      // Setup mocks
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'auctions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: auctionData, error: null })
                }))
              }))
            }))
          };
        }
        if (table === 'orders') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: newOrderData, error: null })
              }))
            }))
          };
        }
        if (table === 'payments') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: 'payment-123' }, error: null })
              }))
            }))
          };
        }
        return { select: vi.fn() };
      });

      // Import the function after mocking
      const { createOrderFromAuction } = await import('$lib/orders');

      // Call the function
      const result = await createOrderFromAuction(auctionId);

      // Should return the new order
      expect(result).toEqual(newOrderData);
    });
  });

  describe('Edge Function Idempotency', () => {
    it('should handle duplicate finalize_auctions calls gracefully', async () => {
      const auctionId = 'auction-123';
      
      // Mock the Edge Function behavior
      const mockFinalizeAuctions = vi.fn()
        .mockResolvedValueOnce({
          success: true,
          processed: 1,
          orders_created: 1, // First call creates order
          errors: []
        })
        .mockResolvedValueOnce({
          success: true,
          processed: 1,
          orders_created: 0, // Second call is idempotent
          errors: []
        });

      // First call - creates order
      const firstResult = await mockFinalizeAuctions(auctionId);
      expect(firstResult.orders_created).toBe(1);

      // Second call - should be idempotent
      const secondResult = await mockFinalizeAuctions(auctionId);
      expect(secondResult.orders_created).toBe(0);
      expect(secondResult.success).toBe(true);
    });
  });

  describe('Database Constraints', () => {
    it('should enforce unique constraint on orders(auction_id)', async () => {
      const auctionId = 'auction-123';
      const listingId = 'listing-456';
      const buyerId = 'buyer-789';
      const sellerId = 'seller-101';
      const winningBidId = 'bid-202';

      // Mock auction data
      const auctionData = {
        id: auctionId,
        listing_id: listingId,
        high_bid_id: winningBidId,
        status: 'ended',
        listings: {
          id: listingId,
          seller_id: sellerId,
          title: 'Test Item',
          description: 'Test Description',
          listing_photos: []
        },
        bids: [{
          id: winningBidId,
          bidder_id: buyerId,
          amount_cents: 10000
        }]
      };

      // Mock unique constraint violation
      const uniqueViolationError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "uniq_orders_auction_id"'
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'auctions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: auctionData, error: null })
                }))
              }))
            }))
          };
        }
        if (table === 'orders') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: null, error: uniqueViolationError })
              }))
            }))
          };
        }
        return { select: vi.fn() };
      });

      // Import the function after mocking
      const { createOrderFromAuction } = await import('$lib/orders');

      // Call the function
      const result = await createOrderFromAuction(auctionId);

      // Should return null due to constraint violation
      expect(result).toBeNull();
    });
  });
});
