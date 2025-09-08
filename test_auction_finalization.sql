-- Test the auction finalization system
-- This creates test data and verifies the finalization process works

BEGIN;

-- Test 1: Create test data for auction finalization
INSERT INTO users (id, email, legal_name, kyc, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'seller@test.com', 'Test Seller', 'passed', 'seller'),
  ('22222222-2222-2222-2222-222222222222', 'buyer@test.com', 'Test Buyer', 'passed', 'buyer');

-- Create a test listing that ended 5 minutes ago
INSERT INTO listings (id, seller_id, title, description, category_id, condition, location, start_cents, end_at, status) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Test Item', 'Test auction item', 1, 'new', '{"city": "Sydney"}', 1000, NOW() - INTERVAL '5 minutes', 'live');

-- Create a test auction
INSERT INTO auctions (id, listing_id, status, current_price_cents) VALUES
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'live', 1000);

-- Create a winning bid
INSERT INTO bids (id, auction_id, bidder_id, amount_cents, placed_at) VALUES
  ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 2000, NOW() - INTERVAL '3 minutes');

-- Test 2: Run the auction finalization function
SELECT 'Before finalization:' as test_phase;
SELECT status, COUNT(*) FROM auctions GROUP BY status;
SELECT COUNT(*) as order_count FROM orders;
SELECT COUNT(*) as notification_count FROM notifications;

-- Run the finalization
SELECT trigger_auction_finalization() as finalization_result;

-- Test 3: Verify results
SELECT 'After finalization:' as test_phase;
SELECT status, COUNT(*) FROM auctions GROUP BY status;
SELECT COUNT(*) as order_count FROM orders;
SELECT state, COUNT(*) FROM orders GROUP BY state;
SELECT type, COUNT(*) FROM notifications GROUP BY type;

-- Test 4: Test Edge Function idempotency by running finalization again
SELECT 'Testing idempotency:' as test_phase;
SELECT trigger_auction_finalization() as second_run_result;

-- Should not create duplicate orders or notifications
SELECT COUNT(*) as final_order_count FROM orders;
SELECT type, COUNT(*) FROM notifications GROUP BY type ORDER BY type;

ROLLBACK;
