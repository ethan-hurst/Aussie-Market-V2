-- Foreign keys and indexes validation

-- Check critical FKs exist and are valid
DO $$ BEGIN
  PERFORM 1 FROM information_schema.table_constraints 
   WHERE table_name='listings' AND constraint_type='FOREIGN KEY';
  IF NOT FOUND THEN RAISE EXCEPTION 'No foreign keys on listings'; END IF;

  PERFORM 1 FROM information_schema.table_constraints 
   WHERE table_name='orders' AND constraint_type='FOREIGN KEY';
  IF NOT FOUND THEN RAISE EXCEPTION 'No foreign keys on orders'; END IF;

  PERFORM 1 FROM information_schema.table_constraints 
   WHERE table_name='bids' AND constraint_type='FOREIGN KEY';
  IF NOT FOUND THEN RAISE EXCEPTION 'No foreign keys on bids'; END IF;
END $$;

-- Check presence of common indexes for performance
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname LIKE '%listings_seller_id%') THEN
    -- Note: schema.sql creates indexes; allow different names, but ensure some index on (seller_id)
    PERFORM 1 FROM pg_index i
      JOIN pg_class t ON t.oid=i.indrelid
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum = ANY(i.indkey)
     WHERE t.relname='listings' AND a.attname='seller_id';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing index on listings.seller_id'; END IF;
  END IF;

  PERFORM 1 FROM pg_index i
    JOIN pg_class t ON t.oid=i.indrelid
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum = ANY(i.indkey)
   WHERE t.relname='orders' AND a.attname='buyer_id';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing index on orders.buyer_id'; END IF;

  PERFORM 1 FROM pg_index i
    JOIN pg_class t ON t.oid=i.indrelid
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum = ANY(i.indkey)
   WHERE t.relname='orders' AND a.attname='seller_id';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing index on orders.seller_id'; END IF;
END $$;


