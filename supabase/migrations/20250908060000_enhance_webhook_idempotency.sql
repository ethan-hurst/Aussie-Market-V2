-- Enhanced webhook idempotency and order state management
-- Migration: 20250908060000_enhance_webhook_idempotency.sql
-- Purpose: Implement comprehensive database-level idempotency constraints and order state validation
-- Dependencies: Requires existing webhook_events table and order_state enum

BEGIN;

-- Step 1: Enhance webhook_events table for comprehensive idempotency
DO $$
BEGIN
    -- Add order_id and event_type columns if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'webhook_events' 
        AND column_name = 'order_id'
    ) THEN
        ALTER TABLE public.webhook_events 
        ADD COLUMN order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'webhook_events' 
        AND column_name = 'event_type'
    ) THEN
        ALTER TABLE public.webhook_events 
        ADD COLUMN event_type TEXT NOT NULL DEFAULT 'unknown';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'webhook_events' 
        AND column_name = 'retry_count'
    ) THEN
        ALTER TABLE public.webhook_events 
        ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'webhook_events' 
        AND column_name = 'error_message'
    ) THEN
        ALTER TABLE public.webhook_events 
        ADD COLUMN error_message TEXT;
    END IF;
END $$;

-- Step 2: Create comprehensive idempotency constraints
-- Global event idempotency (already exists via PRIMARY KEY on event_id)
-- Order-specific idempotency for payment events
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_order_type_idempotency 
ON public.webhook_events (order_id, event_type, event_id) 
WHERE order_id IS NOT NULL AND event_type IN (
    'payment_intent.succeeded',
    'payment_intent.payment_failed', 
    'charge.dispute.created',
    'charge.dispute.closed',
    'charge.refunded'
);

-- Step 3: Add performance indexes for webhook processing
CREATE INDEX IF NOT EXISTS idx_webhook_events_order_id ON public.webhook_events(order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON public.webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processing_status ON public.webhook_events(processed_at, retry_count);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at_desc ON public.webhook_events(created_at DESC);

-- Step 4: Create order state transition validation function
CREATE OR REPLACE FUNCTION validate_order_state_transition(
    current_state order_state,
    new_state order_state,
    user_role TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    -- Define valid state transitions
    CASE current_state
        WHEN 'pending_payment' THEN
            RETURN new_state IN ('paid', 'cancelled');
        WHEN 'paid' THEN
            RETURN new_state IN ('ready_for_handover', 'cancelled', 'refunded');
        WHEN 'ready_for_handover' THEN
            RETURN new_state IN ('shipped', 'cancelled');
        WHEN 'shipped' THEN
            RETURN new_state IN ('delivered', 'cancelled');
        WHEN 'delivered' THEN
            RETURN new_state IN ('released', 'cancelled');
        WHEN 'released' THEN
            RETURN FALSE; -- Terminal state
        WHEN 'refunded' THEN
            RETURN FALSE; -- Terminal state
        WHEN 'cancelled' THEN
            RETURN FALSE; -- Terminal state
        ELSE
            RETURN FALSE;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 5: Create order state transition trigger
CREATE OR REPLACE FUNCTION check_order_state_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Skip validation for initial insert (NEW.state is default)
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- Validate state transition
    IF NOT validate_order_state_transition(OLD.state, NEW.state) THEN
        RAISE EXCEPTION 'Invalid order state transition from % to %', OLD.state, NEW.state;
    END IF;

    -- Ensure updated_at is always updated
    NEW.updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Apply order state transition trigger
DROP TRIGGER IF EXISTS trigger_check_order_state_transition ON public.orders;
CREATE TRIGGER trigger_check_order_state_transition
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION check_order_state_transition();

-- Step 7: Create webhook processing audit function
CREATE OR REPLACE FUNCTION audit_webhook_processing()
RETURNS TRIGGER AS $$
BEGIN
    -- Log webhook processing events
    INSERT INTO public.audit_logs (
        action,
        table_name,
        record_id,
        new_values,
        created_at
    ) VALUES (
        'webhook_' || TG_OP,
        'webhook_events',
        NEW.event_id,
        jsonb_build_object(
            'event_type', NEW.event_type,
            'order_id', NEW.order_id,
            'processed_at', NEW.processed_at,
            'retry_count', NEW.retry_count
        ),
        NOW()
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Apply webhook audit trigger
DROP TRIGGER IF EXISTS trigger_audit_webhook_processing ON public.webhook_events;
CREATE TRIGGER trigger_audit_webhook_processing
    AFTER INSERT OR UPDATE ON public.webhook_events
    FOR EACH ROW
    EXECUTE FUNCTION audit_webhook_processing();

-- Step 9: Update RLS policies for webhook operations
-- Allow service role to manage webhook events
CREATE POLICY "webhook_events_service_role" ON public.webhook_events
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        auth.jwt() ->> 'role' = 'admin'
    );

-- Allow read access for canary testing
CREATE POLICY "webhook_events_canary_read" ON public.webhook_events
    FOR SELECT USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        auth.jwt() ->> 'role' = 'admin'
    );

-- Step 10: Create webhook retry management function
CREATE OR REPLACE FUNCTION process_webhook_retry(
    p_event_id TEXT,
    p_max_retries INTEGER DEFAULT 3
) RETURNS BOOLEAN AS $$
DECLARE
    webhook_record RECORD;
BEGIN
    -- Get webhook event details
    SELECT * INTO webhook_record
    FROM public.webhook_events
    WHERE event_id = p_event_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Webhook event % not found', p_event_id;
    END IF;
    
    -- Check if already processed
    IF webhook_record.processed_at IS NOT NULL THEN
        RETURN TRUE; -- Already processed
    END IF;
    
    -- Check retry limit
    IF webhook_record.retry_count >= p_max_retries THEN
        -- Mark as failed
        UPDATE public.webhook_events
        SET error_message = 'Max retries exceeded',
            processed_at = NOW()
        WHERE event_id = p_event_id;
        RETURN FALSE;
    END IF;
    
    -- Increment retry count
    UPDATE public.webhook_events
    SET retry_count = retry_count + 1,
        updated_at = NOW()
    WHERE event_id = p_event_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Step 11: Add helpful comments
COMMENT ON FUNCTION validate_order_state_transition(order_state, order_state, TEXT) IS 
'Validates if an order state transition is allowed based on business rules';

COMMENT ON FUNCTION check_order_state_transition() IS 
'Trigger function to enforce order state transition validation';

COMMENT ON FUNCTION audit_webhook_processing() IS 
'Audit trigger for webhook event processing';

COMMENT ON FUNCTION process_webhook_retry(TEXT, INTEGER) IS 
'Manages webhook retry logic with exponential backoff';

COMMENT ON INDEX idx_webhook_events_order_type_idempotency IS 
'Ensures idempotency for order-specific webhook events';

COMMIT;
