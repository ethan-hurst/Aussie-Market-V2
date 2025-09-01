-- RLS policies for pickups: allow sellers to create/update pickup records for their orders

-- Insert policy: seller may create pickup for their order
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'pickups' AND policyname = 'pickup_seller_create'
    ) THEN
        CREATE POLICY "pickup_seller_create" ON public.pickups FOR INSERT
            WITH CHECK (
                order_id IN (
                    SELECT id FROM public.orders WHERE seller_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'pickups' AND policyname = 'pickup_seller_update'
    ) THEN
        CREATE POLICY "pickup_seller_update" ON public.pickups FOR UPDATE
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


