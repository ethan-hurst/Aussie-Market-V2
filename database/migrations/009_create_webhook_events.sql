-- Create table for webhook idempotency tracking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'webhook_events'
    ) THEN
        CREATE TABLE public.webhook_events (
            event_id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            processed_at TIMESTAMPTZ NULL
        );

        CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON public.webhook_events(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON public.webhook_events(processed_at DESC);
    END IF;
END $$;

COMMENT ON TABLE public.webhook_events IS 'Tracks received Stripe webhook events for idempotency';
COMMENT ON COLUMN public.webhook_events.event_id IS 'Stripe event id';
COMMENT ON COLUMN public.webhook_events.type IS 'Stripe event type';


