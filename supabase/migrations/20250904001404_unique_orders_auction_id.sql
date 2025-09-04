-- Ensure a single order per auction for idempotency (partial unique index)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_orders_auction_id'
  ) THEN
    EXECUTE 'DROP INDEX public.uniq_orders_auction_id';
  END IF;
  EXECUTE 'CREATE UNIQUE INDEX uniq_orders_auction_id ON public.orders(auction_id) WHERE auction_id IS NOT NULL';
END $$;


