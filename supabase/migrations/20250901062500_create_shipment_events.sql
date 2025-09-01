-- Shipment events for tracking timeline

CREATE TABLE IF NOT EXISTS public.shipment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
    status TEXT NOT NULL,                    -- e.g., accepted, in_transit, out_for_delivery, delivered
    description TEXT,
    location TEXT,
    event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick timeline queries
CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment_time
    ON public.shipment_events (shipment_id, event_time DESC);

-- Enable RLS
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

-- Policy: buyer or seller of related order can read
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shipment_events' AND policyname='shipment_events_party_read'
    ) THEN
        CREATE POLICY shipment_events_party_read ON public.shipment_events FOR SELECT
            USING (
                shipment_id IN (
                    SELECT s.id FROM public.shipments s
                    JOIN public.orders o ON o.id = s.order_id
                    WHERE o.buyer_id = auth.uid() OR o.seller_id = auth.uid()
                )
            );
    END IF;

    -- Policy: seller may insert events for their orders
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shipment_events' AND policyname='shipment_events_seller_insert'
    ) THEN
        CREATE POLICY shipment_events_seller_insert ON public.shipment_events FOR INSERT
            WITH CHECK (
                shipment_id IN (
                    SELECT s.id FROM public.shipments s
                    JOIN public.orders o ON o.id = s.order_id
                    WHERE o.seller_id = auth.uid()
                )
            );
    END IF;
END$$;

-- Trigger: update shipments first_scan_at / delivered_at based on statuses
CREATE OR REPLACE FUNCTION public.update_shipment_aggregate()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_status TEXT;
BEGIN
    v_status := NEW.status;
    IF v_status IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_status IN ('accepted', 'in_transit') THEN
        UPDATE public.shipments SET first_scan_at = COALESCE(first_scan_at, NEW.event_time)
        WHERE id = NEW.shipment_id;
    ELSIF v_status = 'delivered' THEN
        UPDATE public.shipments SET delivered_at = COALESCE(delivered_at, NEW.event_time)
        WHERE id = NEW.shipment_id;
        -- also mark order delivered if not already
        UPDATE public.orders o
        SET state = 'delivered', updated_at = NOW()
        FROM public.shipments s
        WHERE s.id = NEW.shipment_id AND o.id = s.order_id AND o.state <> 'delivered';
    END IF;
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_update_shipment_aggregate ON public.shipment_events;
CREATE TRIGGER trg_update_shipment_aggregate
AFTER INSERT ON public.shipment_events
FOR EACH ROW EXECUTE FUNCTION public.update_shipment_aggregate();


