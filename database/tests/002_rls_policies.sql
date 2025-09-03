-- RLS and policies validation

-- Ensure RLS is enabled on critical tables and at least one policy exists
DO $$ BEGIN
  -- Helper block
  PERFORM 1 FROM pg_class WHERE relname = 'users' AND relrowsecurity = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS not enabled on users'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users') THEN
    RAISE EXCEPTION 'No policies on users';
  END IF;

  PERFORM 1 FROM pg_class WHERE relname = 'listings' AND relrowsecurity = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS not enabled on listings'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='listings') THEN
    RAISE EXCEPTION 'No policies on listings';
  END IF;

  PERFORM 1 FROM pg_class WHERE relname = 'orders' AND relrowsecurity = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS not enabled on orders'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders') THEN
    RAISE EXCEPTION 'No policies on orders';
  END IF;

  PERFORM 1 FROM pg_class WHERE relname = 'payments' AND relrowsecurity = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS not enabled on payments'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payments') THEN
    RAISE EXCEPTION 'No policies on payments';
  END IF;

  PERFORM 1 FROM pg_class WHERE relname = 'ledger_entries' AND relrowsecurity = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS not enabled on ledger_entries'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ledger_entries') THEN
    RAISE EXCEPTION 'No policies on ledger_entries';
  END IF;

  PERFORM 1 FROM pg_class WHERE relname = 'bids' AND relrowsecurity = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS not enabled on bids'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bids') THEN
    RAISE EXCEPTION 'No policies on bids';
  END IF;

  PERFORM 1 FROM pg_class WHERE relname = 'auctions' AND relrowsecurity = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS not enabled on auctions'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='auctions') THEN
    RAISE EXCEPTION 'No policies on auctions';
  END IF;

  PERFORM 1 FROM pg_class WHERE relname = 'shipments' AND relrowsecurity = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS not enabled on shipments'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shipments') THEN
    RAISE EXCEPTION 'No policies on shipments';
  END IF;

  PERFORM 1 FROM pg_class WHERE relname = 'pickups' AND relrowsecurity = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS not enabled on pickups'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pickups') THEN
    RAISE EXCEPTION 'No policies on pickups';
  END IF;

  PERFORM 1 FROM pg_class WHERE relname = 'disputes' AND relrowsecurity = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS not enabled on disputes'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='disputes') THEN
    RAISE EXCEPTION 'No policies on disputes';
  END IF;

  PERFORM 1 FROM pg_class WHERE relname = 'message_threads' AND relrowsecurity = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS not enabled on message_threads'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_threads') THEN
    RAISE EXCEPTION 'No policies on message_threads';
  END IF;

  PERFORM 1 FROM pg_class WHERE relname = 'messages' AND relrowsecurity = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'RLS not enabled on messages'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages') THEN
    RAISE EXCEPTION 'No policies on messages';
  END IF;
END $$;


