-- Order performance optimization and additional constraints
-- Migration: 20250908061000_order_performance_optimization.sql
-- Purpose: Add performance indexes, constraints, and validation functions for order processing
-- Dependencies: Requires enhanced webhook_events table and order state validation

BEGIN;

-- Step 1: Add performance indexes for order queries
CREATE INDEX IF NOT EXISTS idx_orders_state_updated_at ON public.orders(state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_state ON public.orders(buyer_id, state) WHERE state != 'cancelled';
CREATE INDEX IF NOT EXISTS idx_orders_seller_state ON public.orders(seller_id, state) WHERE state != 'cancelled';
CREATE INDEX IF NOT EXISTS idx_orders_stripe_intent_state ON public.orders(stripe_payment_intent_id, state) WHERE stripe_payment_intent_id IS NOT NULL;

-- Step 2: Add composite indexes for webhook processing
CREATE INDEX IF NOT EXISTS idx_orders_auction_payment ON public.orders(auction_id, state) WHERE auction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_listing_buyer ON public.orders(listing_id, buyer_id, state);

-- Step 3: Add check constraints for data integrity
ALTER TABLE public.orders 
ADD CONSTRAINT check_order_amount_positive 
CHECK (amount_cents > 0);

ALTER TABLE public.orders 
ADD CONSTRAINT check_order_seller_buyer_different 
CHECK (seller_id != buyer_id);

ALTER TABLE public.orders 
ADD CONSTRAINT check_order_state_consistency 
CHECK (
    (state = 'pending_payment' AND stripe_payment_intent_id IS NULL) OR
    (state IN ('paid', 'ready_for_handover', 'shipped', 'delivered', 'released', 'refunded') AND stripe_payment_intent_id IS NOT NULL) OR
    (state = 'cancelled')
);

-- Step 4: Create order validation function for webhook processing
CREATE OR REPLACE FUNCTION validate_order_for_webhook(
    p_order_id UUID,
    p_event_type TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    order_record RECORD;
BEGIN
    -- Get order details
    SELECT * INTO order_record
    FROM public.orders
    WHERE id = p_order_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;
    
    -- Validate based on event type
    CASE p_event_type
        WHEN 'payment_intent.succeeded' THEN
            RETURN order_record.state = 'pending_payment';
        WHEN 'payment_intent.payment_failed' THEN
            RETURN order_record.state = 'pending_payment';
        WHEN 'charge.dispute.created' THEN
            RETURN order_record.state IN ('paid', 'ready_for_handover', 'shipped', 'delivered');
        WHEN 'charge.dispute.closed' THEN
            RETURN order_record.state IN ('paid', 'ready_for_handover', 'shipped', 'delivered', 'refunded');
        WHEN 'charge.refunded' THEN
            RETURN order_record.state IN ('paid', 'ready_for_handover', 'shipped', 'delivered', 'released');
        ELSE
            RETURN TRUE; -- Allow other event types
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMIT;