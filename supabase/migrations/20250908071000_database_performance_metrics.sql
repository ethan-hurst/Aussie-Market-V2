-- Database performance metrics collection system
-- Migration: 20250908071000_database_performance_metrics.sql
-- Purpose: Create comprehensive database performance monitoring and metrics collection
-- Dependencies: Requires pg_stat_statements extension and structured_metrics table

-- Create table for database performance metrics
CREATE TABLE IF NOT EXISTS public.db_performance_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value NUMERIC NOT NULL,
    unit TEXT,
    tags JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    recorded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_db_performance_metrics_type_name ON public.db_performance_metrics(metric_type, metric_name);
CREATE INDEX IF NOT EXISTS idx_db_performance_metrics_recorded_at ON public.db_performance_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_db_performance_metrics_tags ON public.db_performance_metrics USING GIN(tags);

-- Enable RLS
ALTER TABLE public.db_performance_metrics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (admin only access)
CREATE POLICY "db_performance_metrics_admin_only" ON public.db_performance_metrics
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Create function to collect database performance metrics
CREATE OR REPLACE FUNCTION collect_db_performance_metrics()
RETURNS INTEGER AS $$
DECLARE
    metrics_collected INTEGER := 0;
    db_size_bytes BIGINT;
    active_connections INTEGER;
    max_connections INTEGER;
    cache_hit_ratio NUMERIC;
    index_usage_ratio NUMERIC;
    slow_query_count INTEGER;
    lock_count INTEGER;
    deadlock_count INTEGER;
    temp_files_count BIGINT;
    temp_bytes BIGINT;
BEGIN
    -- Database size
    SELECT pg_database_size(current_database()) INTO db_size_bytes;
    INSERT INTO public.db_performance_metrics (metric_type, metric_name, value, unit, tags, metadata)
    VALUES ('database', 'size_bytes', db_size_bytes, 'bytes', '{}', jsonb_build_object('database', current_database()));
    metrics_collected := metrics_collected + 1;

    -- Connection metrics
    SELECT count(*) INTO active_connections FROM pg_stat_activity WHERE state = 'active';
    SELECT setting::INTEGER INTO max_connections FROM pg_settings WHERE name = 'max_connections';
    
    INSERT INTO public.db_performance_metrics (metric_type, metric_name, value, unit, tags, metadata)
    VALUES ('connections', 'active_count', active_connections, 'count', '{}', '{}');
    metrics_collected := metrics_collected + 1;
    
    INSERT INTO public.db_performance_metrics (metric_type, metric_name, value, unit, tags, metadata)
    VALUES ('connections', 'max_count', max_connections, 'count', '{}', '{}');
    metrics_collected := metrics_collected + 1;

    -- Cache hit ratio
    SELECT 
        CASE 
            WHEN (blks_hit + blks_read) = 0 THEN 0
            ELSE round((blks_hit::NUMERIC / (blks_hit + blks_read)) * 100, 2)
        END
    INTO cache_hit_ratio
    FROM pg_stat_database 
    WHERE datname = current_database();
    
    INSERT INTO public.db_performance_metrics (metric_type, metric_name, value, unit, tags, metadata)
    VALUES ('cache', 'hit_ratio_percent', cache_hit_ratio, 'percent', '{}', '{}');
    metrics_collected := metrics_collected + 1;

    -- Index usage ratio
    SELECT 
        CASE 
            WHEN (idx_scan + idx_tup_read) = 0 THEN 0
            ELSE round((idx_scan::NUMERIC / (idx_scan + idx_tup_read)) * 100, 2)
        END
    INTO index_usage_ratio
    FROM pg_stat_database 
    WHERE datname = current_database();
    
    INSERT INTO public.db_performance_metrics (metric_type, metric_name, value, unit, tags, metadata)
    VALUES ('indexes', 'usage_ratio_percent', index_usage_ratio, 'percent', '{}', '{}');
    metrics_collected := metrics_collected + 1;

    -- Slow query count (from our slow_query_logs table)
    SELECT COUNT(*) INTO slow_query_count 
    FROM public.slow_query_logs 
    WHERE recorded_at > NOW() - INTERVAL '1 hour';
    
    INSERT INTO public.db_performance_metrics (metric_type, metric_name, value, unit, tags, metadata)
    VALUES ('queries', 'slow_count_last_hour', slow_query_count, 'count', '{}', '{}');
    metrics_collected := metrics_collected + 1;

    -- Lock metrics
    SELECT COUNT(*) INTO lock_count FROM pg_locks WHERE NOT granted;
    
    INSERT INTO public.db_performance_metrics (metric_type, metric_name, value, unit, tags, metadata)
    VALUES ('locks', 'waiting_count', lock_count, 'count', '{}', '{}');
    metrics_collected := metrics_collected + 1;

    -- Deadlock count
    SELECT deadlocks INTO deadlock_count FROM pg_stat_database WHERE datname = current_database();
    
    INSERT INTO public.db_performance_metrics (metric_type, metric_name, value, unit, tags, metadata)
    VALUES ('locks', 'deadlock_count_total', deadlock_count, 'count', '{}', '{}');
    metrics_collected := metrics_collected + 1;

    -- Temporary file usage
    SELECT temp_files, temp_bytes INTO temp_files_count, temp_bytes 
    FROM pg_stat_database WHERE datname = current_database();
    
    INSERT INTO public.db_performance_metrics (metric_type, metric_name, value, unit, tags, metadata)
    VALUES ('temp_files', 'count_total', temp_files_count, 'count', '{}', '{}');
    metrics_collected := metrics_collected + 1;
    
    INSERT INTO public.db_performance_metrics (metric_type, metric_name, value, unit, tags, metadata)
    VALUES ('temp_files', 'bytes_total', temp_bytes, 'bytes', '{}', '{}');
    metrics_collected := metrics_collected + 1;

    RETURN metrics_collected;
END;
$$ LANGUAGE plpgsql;

-- Create function to collect table-specific performance metrics
CREATE OR REPLACE FUNCTION collect_table_performance_metrics()
RETURNS INTEGER AS $$
DECLARE
    table_record RECORD;
    metrics_collected INTEGER := 0;
    table_size_bytes BIGINT;
    index_size_bytes BIGINT;
    row_count BIGINT;
    seq_scan_count BIGINT;
    seq_tup_read BIGINT;
    idx_scan_count BIGINT;
    idx_tup_fetch BIGINT;
BEGIN
    -- Get metrics for each table
    FOR table_record IN
        SELECT 
            schemaname,
            tablename,
            n_tup_ins,
            n_tup_upd,
            n_tup_del,
            n_live_tup,
            n_dead_tup,
            n_mod_since_analyze,
            last_vacuum,
            last_autovacuum,
            last_analyze,
            last_autoanalyze
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
    LOOP
        -- Table size
        SELECT pg_total_relation_size(table_record.schemaname||'.'||table_record.tablename) INTO table_size_bytes;
        
        INSERT INTO public.db_performance_metrics (
            metric_type, metric_name, value, unit, tags, metadata
        ) VALUES (
            'table_size', 'total_bytes', table_size_bytes, 'bytes',
            jsonb_build_object('table', table_record.tablename),
            jsonb_build_object('schema', table_record.schemaname)
        );
        metrics_collected := metrics_collected + 1;

        -- Row count
        INSERT INTO public.db_performance_metrics (
            metric_type, metric_name, value, unit, tags, metadata
        ) VALUES (
            'table_rows', 'live_count', table_record.n_live_tup, 'count',
            jsonb_build_object('table', table_record.tablename),
            jsonb_build_object('dead_tuples', table_record.n_dead_tup)
        );
        metrics_collected := metrics_collected + 1;

        -- Insert/Update/Delete counts
        INSERT INTO public.db_performance_metrics (
            metric_type, metric_name, value, unit, tags, metadata
        ) VALUES (
            'table_operations', 'insert_count', table_record.n_tup_ins, 'count',
            jsonb_build_object('table', table_record.tablename),
            jsonb_build_object('operation', 'insert')
        );
        metrics_collected := metrics_collected + 1;

        INSERT INTO public.db_performance_metrics (
            metric_type, metric_name, value, unit, tags, metadata
        ) VALUES (
            'table_operations', 'update_count', table_record.n_tup_upd, 'count',
            jsonb_build_object('table', table_record.tablename),
            jsonb_build_object('operation', 'update')
        );
        metrics_collected := metrics_collected + 1;

        INSERT INTO public.db_performance_metrics (
            metric_type, metric_name, value, unit, tags, metadata
        ) VALUES (
            'table_operations', 'delete_count', table_record.n_tup_del, 'count',
            jsonb_build_object('table', table_record.tablename),
            jsonb_build_object('operation', 'delete')
        );
        metrics_collected := metrics_collected + 1;
    END LOOP;

    RETURN metrics_collected;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up old performance metrics
CREATE OR REPLACE FUNCTION cleanup_old_db_performance_metrics(
    p_retention_days INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.db_performance_metrics
    WHERE recorded_at < NOW() - (p_retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule performance metrics collection (run every 5 minutes)
SELECT cron.schedule(
    'collect-db-performance-metrics',
    '*/5 * * * *', -- Every 5 minutes
    'SELECT collect_db_performance_metrics();'
);

-- Schedule table performance metrics collection (run every 15 minutes)
SELECT cron.schedule(
    'collect-table-performance-metrics',
    '*/15 * * * *', -- Every 15 minutes
    'SELECT collect_table_performance_metrics();'
);

-- Schedule cleanup of old performance metrics (run daily at 4 AM)
SELECT cron.schedule(
    'cleanup-db-performance-metrics',
    '0 4 * * *', -- Daily at 4 AM
    'SELECT cleanup_old_db_performance_metrics(30);' -- Keep 30 days
);

-- Grant permissions
GRANT EXECUTE ON FUNCTION collect_db_performance_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION collect_table_performance_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_db_performance_metrics(INTEGER) TO authenticated;

-- Add helpful comments
COMMENT ON TABLE public.db_performance_metrics IS 'Database performance metrics for monitoring and analysis';
COMMENT ON FUNCTION collect_db_performance_metrics() IS 'Collects comprehensive database performance metrics';
COMMENT ON FUNCTION collect_table_performance_metrics() IS 'Collects table-specific performance metrics';
COMMENT ON FUNCTION cleanup_old_db_performance_metrics(INTEGER) IS 'Cleans up old performance metrics to maintain performance';
