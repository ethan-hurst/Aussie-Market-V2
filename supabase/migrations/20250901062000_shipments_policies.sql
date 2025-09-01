-- RLS policies for shipments: allow sellers to create/update shipment records for their orders

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'shipments' AND policyname = 'shipment_seller_create'
    ) THEN
        CREATE POLICY "shipment_seller_create" ON public.shipments FOR INSERT
            WITH CHECK (
                order_id IN (
                    SELECT id FROM public.orders WHERE seller_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'shipments' AND policyname = 'shipment_seller_update'
    ) THEN
        CREATE POLICY "shipment_seller_update" ON public.shipments FOR UPDATE
            USING (
                order_id IN (
                    SELECT id FROM public.orders WHERE seller_id = auth.uid()
                )
            )
            WITH CHECK (
                order_id IN (
                    SELECT id FROM public.orders WHERE seller_id = auth.uid()
                )
            );
    END IF;
END$$;


