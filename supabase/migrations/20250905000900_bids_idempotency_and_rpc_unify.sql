-- Enforce idempotency and remove legacy listing-centric place_bid wrapper

-- Idempotency: prevent duplicate identical bids by same bidder on the same auction
CREATE UNIQUE INDEX IF NOT EXISTS idx_bids_auction_bidder_amount_unique
ON public.bids (auction_id, bidder_id, amount_cents);

-- Remove legacy listing-centric RPC signature to ensure single authoritative entrypoint
DROP FUNCTION IF EXISTS public.place_bid(UUID, UUID, INTEGER, INTEGER);

-- Ensure execute privileges remain for canonical auctions-centric function
GRANT EXECUTE ON FUNCTION public.place_bid(UUID, INTEGER, INTEGER) TO authenticated;


