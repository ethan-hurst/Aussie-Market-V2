-- Enable pg_stat_statements extension for query performance monitoring
-- Migration: 20250908070000_enable_pg_stat_statements.sql
-- Purpose: Enable PostgreSQL query statistics collection and monitoring
-- Dependencies: None

-- Enable pg_stat_statements extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create table for storing slow query logs
CREATE TABLE IF NOT EXISTS public.slow_query_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    query_text TEXT NOT NULL,
    query_hash BIGINT NOT NULL,
    execution_time_ms NUMERIC NOT NULL,
    rows_returned BIGINT,
    rows_examined BIGINT,
    database_name TEXT,
    user_name TEXT,
    application_name TEXT,
    query_start TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_slow_query_logs_execution_time ON public.slow_query_logs(execution_time_ms DESC);
CREATE INDEX IF NOT EXISTS idx_slow_query_logs_query_hash ON public.slow_query_logs(query_hash);
CREATE INDEX IF NOT EXISTS idx_slow_query_logs_recorded_at ON public.slow_query_logs(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_slow_query_logs_database_name ON public.slow_query_logs(database_name);

-- Enable RLS
ALTER TABLE public.slow_query_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (admin only access)
CREATE POLICY "slow_query_logs_admin_only" ON public.slow_query_logs
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Create function to detect and log slow queries
CREATE OR REPLACE FUNCTION detect_slow_queries(
    p_threshold_ms NUMERIC DEFAULT 1000
) RETURNS INTEGER AS $$
DECLARE
    slow_query_count INTEGER := 0;
    query_record RECORD;
BEGIN
    -- Get slow queries from pg_stat_statements
    FOR query_record IN
        SELECT 
            query,
            queryid,
            mean_exec_time,
            calls,
            total_exec_time,
            rows,
            shared_blks_hit,
            shared_blks_read,
            dbid,
            userid
        FROM pg_stat_statements 
        WHERE mean_exec_time > p_threshold_ms
        ORDER BY mean_exec_time DESC
        LIMIT 100
    LOOP
        -- Insert slow query into log table
        INSERT INTO public.slow_query_logs (
            query_text,
            query_hash,
            execution_time_ms,
            rows_returned,
            rows_examined,
            database_name,
            user_name,
            application_name,
            query_start,
            metadata
        ) VALUES (
            query_record.query,
            query_record.queryid,
            query_record.mean_exec_time,
            query_record.rows,
            query_record.shared_blks_hit + query_record.shared_blks_read,
            (SELECT datname FROM pg_database WHERE oid = query_record.dbid),
            (SELECT usename FROM pg_user WHERE usesysid = query_record.userid),
            'supabase',
            NOW() - INTERVAL '1 hour', -- Approximate query start time
            jsonb_build_object(
                'calls', query_record.calls,
                'total_exec_time', query_record.total_exec_time,
                'shared_blks_hit', query_record.shared_blks_hit,
                'shared_blks_read', query_record.shared_blks_read
            )
        );
        
        slow_query_count := slow_query_count + 1;
    END LOOP;
    
    RETURN slow_query_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up old slow query logs
CREATE OR REPLACE FUNCTION cleanup_old_slow_query_logs(
    p_retention_days INTEGER DEFAULT 7
) RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.slow_query_logs
    WHERE recorded_at < NOW() - (p_retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule slow query detection (run every 5 minutes)
SELECT cron.schedule(
    'detect-slow-queries',
    '*/5 * * * *', -- Every 5 minutes
    'SELECT detect_slow_queries(1000);' -- 1 second threshold
);

-- Schedule cleanup of old slow query logs (run daily at 3 AM)
SELECT cron.schedule(
    'cleanup-slow-query-logs',
    '0 3 * * *', -- Daily at 3 AM
    'SELECT cleanup_old_slow_query_logs(7);' -- Keep 7 days
);

-- Grant permissions
GRANT EXECUTE ON FUNCTION detect_slow_queries(NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_slow_query_logs(INTEGER) TO authenticated;

-- Add helpful comments
COMMENT ON TABLE public.slow_query_logs IS 'Logs of slow database queries for performance monitoring';
COMMENT ON FUNCTION detect_slow_queries(NUMERIC) IS 'Detects and logs queries exceeding the specified threshold';
COMMENT ON FUNCTION cleanup_old_slow_query_logs(INTEGER) IS 'Cleans up old slow query logs to maintain performance';
