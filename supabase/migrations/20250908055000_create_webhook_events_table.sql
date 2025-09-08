-- Create webhook_events table for idempotency tracking
-- Migration: 20250908055000_create_webhook_events_table.sql
-- Purpose: Create the initial webhook_events table structure
-- Dependencies: None

BEGIN;

-- Create table for webhook idempotency tracking
CREATE TABLE IF NOT EXISTS public.webhook_events (
    event_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON public.webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON public.webhook_events(processed_at DESC);

-- Enable RLS
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Add helpful comments
COMMENT ON TABLE public.webhook_events IS 'Tracks received Stripe webhook events for idempotency';
COMMENT ON COLUMN public.webhook_events.event_id IS 'Stripe event id';
COMMENT ON COLUMN public.webhook_events.type IS 'Stripe event type';
COMMENT ON COLUMN public.webhook_events.created_at IS 'When the webhook event was received';
COMMENT ON COLUMN public.webhook_events.processed_at IS 'When the webhook event was processed (NULL = pending)';

COMMIT;
