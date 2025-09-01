-- Simple Database State Inspection Script
-- Run this after applying the auction marketplace schema to see what was created

-- 1. Check what tables exist in the public schema
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. Check what custom types (ENUMs) exist
SELECT 
    t.typname as type_name,
    e.enumlabel as enum_value
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;

-- 3. Check table columns and their types (first 10 tables only to avoid overwhelming output)
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public' 
    AND t.table_type = 'BASE TABLE'
    AND c.table_schema = 'public'
    AND t.table_name IN ('users', 'listings', 'auctions', 'bids', 'orders')
ORDER BY t.table_name, c.ordinal_position;

-- 4. Check foreign key relationships
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- 5. Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 6. Check indexes
SELECT 
    schemaname,
    tablename,
    indexname
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 7. Check triggers
SELECT 
    trigger_schema,
    trigger_name,
    event_object_table
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 8. Check functions
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- 9. Check for any errors or missing objects
-- This will show tables that should exist but don't
SELECT 'MISSING TABLE: users' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
UNION ALL
SELECT 'MISSING TABLE: listings' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'listings')
UNION ALL
SELECT 'MISSING TABLE: auctions' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auctions')
UNION ALL
SELECT 'MISSING TABLE: bids' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bids')
UNION ALL
SELECT 'MISSING TABLE: orders' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders')
UNION ALL
SELECT 'MISSING TABLE: payments' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments')
UNION ALL
SELECT 'MISSING TABLE: ledger_entries' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ledger_entries')
UNION ALL
SELECT 'MISSING TABLE: disputes' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'disputes')
UNION ALL
SELECT 'MISSING TABLE: message_threads' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'message_threads')
UNION ALL
SELECT 'MISSING TABLE: messages' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages')
UNION ALL
SELECT 'MISSING TABLE: audit_logs' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs')
UNION ALL
SELECT 'MISSING TABLE: metrics' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'metrics')
UNION ALL
SELECT 'MISSING TABLE: pickups' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pickups')
UNION ALL
SELECT 'MISSING TABLE: shipments' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shipments')
UNION ALL
SELECT 'MISSING TABLE: listing_photos' as issue WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'listing_photos');

-- 10. Check for licensing system tables (these should NOT exist for our auction marketplace)
SELECT 'LICENSING TABLE FOUND: ' || table_name as warning
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN ('licenses', 'instances', 'events', 'transfers', 'rate_limits')
ORDER BY table_name;

-- 11. Summary count of auction tables created
SELECT 
    'AUCTION TABLES CREATED' as summary,
    COUNT(*) as count,
    'out of 15 expected tables' as description
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN (
        'users', 'listings', 'listing_photos', 'auctions', 'bids', 
        'orders', 'payments', 'ledger_entries', 'pickups', 'shipments',
        'disputes', 'message_threads', 'messages', 'audit_logs', 'metrics'
    );

-- 12. List of successfully created auction tables
SELECT 
    'CREATED: ' || table_name as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN (
        'users', 'listings', 'listing_photos', 'auctions', 'bids', 
        'orders', 'payments', 'ledger_entries', 'pickups', 'shipments',
        'disputes', 'message_threads', 'messages', 'audit_logs', 'metrics'
    )
ORDER BY table_name;
