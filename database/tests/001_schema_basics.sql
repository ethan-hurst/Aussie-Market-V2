-- Schema validation: basic checks
-- Run with psql after applying migrations

-- 1) Required extensions
DO $$ BEGIN
  PERFORM 1 FROM pg_extension WHERE extname = 'uuid-ossp';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing extension: uuid-ossp'; END IF;
  PERFORM 1 FROM pg_extension WHERE extname = 'pgcrypto';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing extension: pgcrypto'; END IF;
END $$;

-- 2) Core tables exist
DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing table: public.users'; END IF;
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'listings';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing table: public.listings'; END IF;
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing table: public.orders'; END IF;
END $$;

-- 3) RLS enabled on sensitive tables
DO $$ BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.users'::regclass) THEN
    RAISE EXCEPTION 'RLS not enabled on public.users';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.listings'::regclass) THEN
    RAISE EXCEPTION 'RLS not enabled on public.listings';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.orders'::regclass) THEN
    RAISE EXCEPTION 'RLS not enabled on public.orders';
  END IF;
END $$;

-- 4) updated_at triggers exist
DO $$ BEGIN
  PERFORM 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing updated_at trigger: users'; END IF;
  PERFORM 1 FROM pg_trigger WHERE tgname = 'update_listings_updated_at';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing updated_at trigger: listings'; END IF;
  PERFORM 1 FROM pg_trigger WHERE tgname = 'update_orders_updated_at';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing updated_at trigger: orders'; END IF;
END $$;
