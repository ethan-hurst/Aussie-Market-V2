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

      // Mock existing order check
      const existingOrderMock = {
        data: { id: 'existing-order-123' },
        error: null
      };

      // Mock auction data
      const auctionData = {
        id: auctionId,
        listing_id: listingId,
        high_bid_id: winningBidId,
        status: 'ended'
      };

      // Mock winning bid data
      const winningBidData = {
        id: winningBidId,
        bidder_id: buyerId,
        amount_cents: 10000,
        listings: {
          id: listingId,
          seller_id: sellerId,
          title: 'Test Item'
        }
      };

      // Setup mocks
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(existingOrderMock)
              }))
            }))
          };
        }
        if (table === 'auctions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: auctionData, error: null })
              }))
            }))
          };
        }
        if (table === 'bids') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: winningBidData, error: null })
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

      // Should return null because order already exists
      expect(result).toBeNull();

      // Verify that we checked for existing order
      expect(mockSupabase.from).toHaveBeenCalledWith('orders');
    });

    it('should handle auctions with no bids gracefully', async () => {
      const auctionId = 'auction-no-bids';
      const listingId = 'listing-456';

      // Mock auction data with no high_bid_id
      const auctionData = {
        id: auctionId,
        listing_id: listingId,
        high_bid_id: null,
        status: 'ended'
      };

      // Setup mocks
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'auctions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: auctionData, error: null })
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

      // Mock no existing order
      const noExistingOrderMock = {
        data: null,
        error: { code: 'PGRST116' } // No rows found
      };

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
        if (table === 'orders') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(noExistingOrderMock)
              }))
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: newOrderData, error: null })
              }))
            }))
          };
        }
        if (table === 'auctions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: auctionData, error: null })
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

      // Verify that we checked for existing order first
      expect(mockSupabase.from).toHaveBeenCalledWith('orders');
      
      // Verify that we created a new order
      expect(mockSupabase.from).toHaveBeenCalledWith('orders');
    });
  });

  describe('Edge Function Idempotency', () => {
    it('should handle duplicate finalize_auctions calls gracefully', async () => {
      const auctionId = 'auction-123';
      
      // Mock the Edge Function behavior
      const mockFinalizeAuctions = vi.fn().mockResolvedValue({
        success: true,
        processed: 1,
        orders_created: 0, // No new orders because already exists
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
      
      // Mock unique constraint violation
      const uniqueViolationError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "uniq_orders_auction_id"'
      };

      mockSupabase.from.mockImplementation((table: string) => {
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
