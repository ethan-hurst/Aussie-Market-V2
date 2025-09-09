-- Fix webhook audit function data type mismatch
-- Migration: 20250909000000_fix_webhook_audit_function.sql
-- Purpose: Fix audit_webhook_processing function to handle text event_id properly
-- Dependencies: Requires existing webhook_events table and audit_logs table

BEGIN;

-- Step 1: Fix the audit_webhook_processing function
-- The issue is that record_id in audit_logs is UUID but event_id in webhook_events is TEXT
-- We need to either cast the event_id or change the audit_logs record_id to TEXT
-- Since event_id is a Stripe event ID (text), we'll modify the audit function to handle this

CREATE OR REPLACE FUNCTION audit_webhook_processing()
RETURNS TRIGGER AS $$
BEGIN
    -- Log webhook processing events
    -- Note: We're not inserting into record_id since event_id is TEXT and record_id expects UUID
    -- Instead, we'll store the event_id in the new_values JSONB
    INSERT INTO public.audit_logs (
        action,
        table_name,
        record_id,
        new_values,
        created_at
    ) VALUES (
        'webhook_' || TG_OP,
        'webhook_events',
        NULL, -- record_id is NULL since event_id is TEXT, not UUID
        jsonb_build_object(
            'event_id', NEW.event_id,
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

-- Step 2: Recreate the trigger to ensure it uses the fixed function
DROP TRIGGER IF EXISTS trigger_audit_webhook_processing ON public.webhook_events;
CREATE TRIGGER trigger_audit_webhook_processing
    AFTER INSERT OR UPDATE ON public.webhook_events
    FOR EACH ROW
    EXECUTE FUNCTION audit_webhook_processing();

-- Step 3: Add helpful comments
COMMENT ON FUNCTION audit_webhook_processing() IS 
'Fixed audit trigger for webhook event processing - handles TEXT event_id properly';

COMMIT;
