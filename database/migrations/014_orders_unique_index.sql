-- Ensure a single order per auction for idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_orders_auction_id'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uniq_orders_auction_id ON public.orders(auction_id) NULLS NOT DISTINCT';
  END IF;
END $$;


