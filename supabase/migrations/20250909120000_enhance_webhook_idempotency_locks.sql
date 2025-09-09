-- Enhanced webhook idempotency with advisory locks and version control
-- Migration: 20250909120000_enhance_webhook_idempotency_locks.sql
-- Purpose: Add advisory locking functions and version control for webhook idempotency

BEGIN;

-- Step 1: Add version column to orders table for optimistic locking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'orders' 
        AND column_name = 'version'
    ) THEN
        ALTER TABLE public.orders 
        ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
        
        -- Update existing orders to have version 0
        UPDATE public.orders SET version = 0 WHERE version IS NULL;
    END IF;
END $$;

-- Step 2: Create advisory lock helper functions
CREATE OR REPLACE FUNCTION pg_try_advisory_lock(key INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN pg_try_advisory_lock(key::bigint);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_advisory_unlock(key INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN pg_advisory_unlock(key::bigint);
END;
$$ LANGUAGE plpgsql;

-- Step 3: Enhanced order state transition trigger with version support
CREATE OR REPLACE FUNCTION check_order_state_transition_v2()
RETURNS TRIGGER AS $$
BEGIN
    -- Skip validation for initial insert
    IF TG_OP = 'INSERT' THEN
        NEW.version = COALESCE(NEW.version, 0);
        RETURN NEW;
    END IF;

    -- Validate state transition using the existing function
    IF NOT validate_order_state_transition(OLD.state, NEW.state) THEN
        RAISE EXCEPTION 'Invalid order state transition from % to %', OLD.state, NEW.state;
    END IF;

    -- Increment version for optimistic locking
    NEW.version = COALESCE(OLD.version, 0) + 1;
    
    -- Ensure updated_at is always updated
    NEW.updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Replace the existing trigger
DROP TRIGGER IF EXISTS trigger_check_order_state_transition ON public.orders;
CREATE TRIGGER trigger_check_order_state_transition
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION check_order_state_transition_v2();

-- Step 5: Add indexes for webhook event processing optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_event_id_processed 
ON public.webhook_events (event_id, processed_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_order_type_processed 
ON public.webhook_events (order_id, event_type, processed_at) 
WHERE order_id IS NOT NULL;

-- Step 6: Enhanced webhook event deduplication function
CREATE OR REPLACE FUNCTION check_webhook_event_duplicate(
    p_event_id TEXT,
    p_order_id UUID DEFAULT NULL,
    p_event_type TEXT DEFAULT NULL
) RETURNS TABLE (
    is_duplicate BOOLEAN,
    status TEXT,
    existing_event_id TEXT,
    processed_at TIMESTAMPTZ,
    error_message TEXT
) AS $$
DECLARE
    existing_record RECORD;
BEGIN
    -- Check for exact event ID match first
    SELECT we.event_id, we.processed_at, we.error_message
    INTO existing_record
    FROM public.webhook_events we
    WHERE we.event_id = p_event_id;
    
    IF FOUND THEN
        IF existing_record.processed_at IS NOT NULL AND existing_record.error_message IS NULL THEN
            -- Successfully processed
            RETURN QUERY SELECT TRUE, 'completed', existing_record.event_id, existing_record.processed_at, existing_record.error_message;
        ELSIF existing_record.processed_at IS NOT NULL AND existing_record.error_message IS NOT NULL THEN
            -- Previously failed, allow retry
            RETURN QUERY SELECT FALSE, 'retry_allowed', existing_record.event_id, existing_record.processed_at, existing_record.error_message;
        ELSE
            -- Currently processing
            RETURN QUERY SELECT TRUE, 'processing', existing_record.event_id, existing_record.processed_at, existing_record.error_message;
        END IF;
        RETURN;
    END IF;
    
    -- Check for order-specific duplicates for critical events
    IF p_order_id IS NOT NULL AND p_event_type IN ('payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled') THEN
        SELECT we.event_id, we.processed_at, we.error_message
        INTO existing_record
        FROM public.webhook_events we
        WHERE we.order_id = p_order_id 
        AND we.event_type = p_event_type
        AND we.processed_at IS NOT NULL 
        AND we.error_message IS NULL
        LIMIT 1;
        
        IF FOUND THEN
            -- Order already has successful event of this type
            RETURN QUERY SELECT TRUE, 'order_completed', existing_record.event_id, existing_record.processed_at, existing_record.error_message;
            RETURN;
        END IF;
    END IF;
    
    -- Not a duplicate
    RETURN QUERY SELECT FALSE, 'new', NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Atomic webhook event insertion function
CREATE OR REPLACE FUNCTION insert_webhook_event_atomic(
    p_event_id TEXT,
    p_type TEXT,
    p_event_type TEXT,
    p_order_id UUID DEFAULT NULL,
    p_created_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO public.webhook_events (
        event_id,
        type,
        event_type,
        order_id,
        created_at,
        retry_count
    ) VALUES (
        p_event_id,
        p_type,
        p_event_type,
        p_order_id,
        p_created_at,
        0
    );
    
    RETURN TRUE;
EXCEPTION 
    WHEN unique_violation THEN
        -- Race condition: event was inserted by another process
        RETURN FALSE;
    WHEN OTHERS THEN
        -- Other error
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Enhanced order update function with locking
CREATE OR REPLACE FUNCTION update_order_with_lock(
    p_order_id UUID,
    p_new_state order_state,
    p_payment_intent_id TEXT DEFAULT NULL,
    p_expected_version INTEGER DEFAULT NULL
) RETURNS TABLE (
    success BOOLEAN,
    current_state order_state,
    current_version INTEGER,
    message TEXT
) AS $$
DECLARE
    lock_key INTEGER;
    current_order RECORD;
    update_count INTEGER;
BEGIN
    -- Generate lock key from order ID
    lock_key := ('x' || substr(md5(p_order_id::text), 1, 8))::bit(32)::integer;
    
    -- Acquire advisory lock
    IF NOT pg_try_advisory_lock(lock_key) THEN
        RETURN QUERY SELECT FALSE, NULL::order_state, NULL::INTEGER, 'Could not acquire lock'::TEXT;
        RETURN;
    END IF;
    
    BEGIN
        -- Get current order state
        SELECT o.state, o.version, o.stripe_payment_intent_id
        INTO current_order
        FROM public.orders o
        WHERE o.id = p_order_id;
        
        IF NOT FOUND THEN
            RETURN QUERY SELECT FALSE, NULL::order_state, NULL::INTEGER, 'Order not found'::TEXT;
            RETURN;
        END IF;
        
        -- Check version for optimistic locking
        IF p_expected_version IS NOT NULL AND current_order.version != p_expected_version THEN
            RETURN QUERY SELECT FALSE, current_order.state, current_order.version, 'Version mismatch - concurrent update detected'::TEXT;
            RETURN;
        END IF;
        
        -- Validate state transition
        IF NOT validate_order_state_transition(current_order.state, p_new_state) THEN
            RETURN QUERY SELECT FALSE, current_order.state, current_order.version, format('Invalid state transition from %s to %s', current_order.state, p_new_state)::TEXT;
            RETURN;
        END IF;
        
        -- Perform the update
        UPDATE public.orders
        SET 
            state = p_new_state,
            stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
            paid_at = CASE WHEN p_new_state = 'paid' THEN NOW() ELSE paid_at END,
            updated_at = NOW(),
            version = version + 1
        WHERE id = p_order_id 
        AND state = current_order.state
        AND version = current_order.version;
        
        GET DIAGNOSTICS update_count = ROW_COUNT;
        
        IF update_count = 0 THEN
            -- Concurrent update occurred
            RETURN QUERY SELECT FALSE, current_order.state, current_order.version, 'Concurrent update detected'::TEXT;
        ELSE
            RETURN QUERY SELECT TRUE, p_new_state, current_order.version + 1, 'Success'::TEXT;
        END IF;
        
    EXCEPTION 
        WHEN OTHERS THEN
            RETURN QUERY SELECT FALSE, current_order.state, current_order.version, SQLERRM::TEXT;
    END;
    
    -- Always release the lock
    PERFORM pg_advisory_unlock(lock_key);
END;
$$ LANGUAGE plpgsql;

-- Step 9: Add helpful comments
COMMENT ON FUNCTION check_webhook_event_duplicate(TEXT, UUID, TEXT) IS 
'Checks if a webhook event is a duplicate and returns processing status';

COMMENT ON FUNCTION insert_webhook_event_atomic(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ) IS 
'Atomically inserts a webhook event, handling race conditions gracefully';

COMMENT ON FUNCTION update_order_with_lock(UUID, order_state, TEXT, INTEGER) IS 
'Updates order state with advisory locking and optimistic concurrency control';

COMMENT ON COLUMN public.orders.version IS 
'Version number for optimistic locking to prevent concurrent updates';

COMMIT;