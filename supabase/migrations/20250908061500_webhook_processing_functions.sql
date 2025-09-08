-- Webhook processing functions
-- Migration: 20250908061500_webhook_processing_functions.sql
-- Purpose: Create webhook processing function with atomic operations
-- Dependencies: Requires validate_order_for_webhook function

CREATE OR REPLACE FUNCTION process_webhook_atomically(
    p_event_id TEXT,
    p_order_id UUID,
    p_event_type TEXT,
    p_event_data JSONB DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    webhook_record RECORD;
    order_record RECORD;
    result JSONB;
BEGIN
    -- Validate order exists and is in correct state
    IF NOT validate_order_for_webhook(p_order_id, p_event_type) THEN
        RAISE EXCEPTION 'Order % not in valid state for event type %', p_order_id, p_event_type;
    END IF;
    
    -- Check idempotency
    SELECT * INTO webhook_record
    FROM public.webhook_events
    WHERE event_id = p_event_id;
    
    IF FOUND AND webhook_record.processed_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'message', 'Event already processed'
        );
    END IF;
    
    -- Record or update webhook event
    IF FOUND THEN
        UPDATE public.webhook_events
        SET retry_count = retry_count + 1,
            updated_at = NOW()
        WHERE event_id = p_event_id;
    ELSE
        INSERT INTO public.webhook_events (
            event_id, type, event_type, order_id, created_at
        ) VALUES (
            p_event_id, p_event_type, p_event_type, p_order_id, NOW()
        );
    END IF;
    
    -- Process based on event type
    CASE p_event_type
        WHEN 'payment_intent.succeeded' THEN
            UPDATE public.orders
            SET state = 'paid',
                paid_at = NOW(),
                updated_at = NOW()
            WHERE id = p_order_id;
            
            -- Add ledger entry
            INSERT INTO public.ledger_entries (
                order_id, entry_type, amount_cents, description, created_at
            ) VALUES (
                p_order_id, 'CAPTURE', (SELECT amount_cents FROM public.orders WHERE id = p_order_id),
                'Payment captured via webhook', NOW()
            );
            
        WHEN 'payment_intent.payment_failed' THEN
            UPDATE public.orders
            SET state = 'cancelled',
                updated_at = NOW()
            WHERE id = p_order_id;
            
        WHEN 'charge.refunded' THEN
            UPDATE public.orders
            SET state = 'refunded',
                refunded_at = NOW(),
                updated_at = NOW()
            WHERE id = p_order_id;
            
            -- Add ledger entry
            INSERT INTO public.ledger_entries (
                order_id, entry_type, amount_cents, description, created_at
            ) VALUES (
                p_order_id, 'REFUND', (SELECT amount_cents FROM public.orders WHERE id = p_order_id),
                'Refund processed via webhook', NOW()
            );
    END CASE;
    
    -- Mark webhook as processed
    UPDATE public.webhook_events
    SET processed_at = NOW(),
        updated_at = NOW()
    WHERE event_id = p_event_id;
    
    -- Return success result
    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'order_id', p_order_id,
        'new_state', (SELECT state FROM public.orders WHERE id = p_order_id)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Mark webhook as failed
        UPDATE public.webhook_events
        SET error_message = SQLERRM,
            processed_at = NOW(),
            updated_at = NOW()
        WHERE event_id = p_event_id;
        
        RAISE;
END;
$$ LANGUAGE plpgsql;