-- Webhook monitoring views and cleanup functions
-- Migration: 20250908062000_webhook_monitoring_views.sql
-- Purpose: Create monitoring views and cleanup functions for webhook processing
-- Dependencies: Requires webhook_events table and process_webhook_atomically function

BEGIN;

-- Step 1: Create order state summary view for monitoring
CREATE OR REPLACE VIEW public.order_state_summary AS
SELECT 
    state,
    COUNT(*) as order_count,
    SUM(amount_cents) as total_amount_cents,
    AVG(amount_cents) as avg_amount_cents,
    MIN(created_at) as oldest_order,
    MAX(created_at) as newest_order
FROM public.orders
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY state
ORDER BY order_count DESC;

-- Step 2: Create webhook processing metrics view
CREATE OR REPLACE VIEW public.webhook_processing_metrics AS
SELECT 
    event_type,
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed_events,
    COUNT(*) FILTER (WHERE processed_at IS NULL AND retry_count < 3) as pending_events,
    COUNT(*) FILTER (WHERE processed_at IS NULL AND retry_count >= 3) as failed_events,
    AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time_seconds,
    MAX(retry_count) as max_retry_count
FROM public.webhook_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY event_type
ORDER BY total_events DESC;

-- Step 3: Add RLS policies for new views
ALTER VIEW public.order_state_summary SET (security_invoker = true);
ALTER VIEW public.webhook_processing_metrics SET (security_invoker = true);

-- Step 4: Create function to clean up old webhook events
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events(
    p_retention_days INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.webhook_events
    WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL
    AND processed_at IS NOT NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Add helpful comments
COMMENT ON FUNCTION validate_order_for_webhook(UUID, TEXT) IS 
'Validates if an order is in the correct state for a specific webhook event type';

COMMENT ON FUNCTION process_webhook_atomically(TEXT, UUID, TEXT, JSONB) IS 
'Atomically processes webhook events with idempotency and state validation';

COMMENT ON VIEW public.order_state_summary IS 
'Summary statistics of order states for monitoring and analytics';

COMMENT ON VIEW public.webhook_processing_metrics IS 
'Metrics on webhook processing performance and success rates';

COMMENT ON FUNCTION cleanup_old_webhook_events(INTEGER) IS 
'Cleans up old processed webhook events to maintain performance';

COMMIT;
