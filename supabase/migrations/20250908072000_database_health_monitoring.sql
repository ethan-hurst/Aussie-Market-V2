-- Database health monitoring and dashboard views
-- Migration: 20250908072000_database_health_monitoring.sql
-- Purpose: Create database health check endpoints and monitoring dashboard
-- Dependencies: Requires db_performance_metrics table and slow_query_logs table

-- Create database health status view
CREATE OR REPLACE VIEW public.database_health_status AS
WITH latest_metrics AS (
    SELECT 
        metric_name,
        value,
        recorded_at,
        ROW_NUMBER() OVER (PARTITION BY metric_name ORDER BY recorded_at DESC) as rn
    FROM public.db_performance_metrics
    WHERE recorded_at > NOW() - INTERVAL '1 hour'
),
health_checks AS (
    SELECT 
        'database_size' as check_name,
        CASE 
            WHEN value > 1073741824 * 10 THEN 'warning' -- > 10GB
            WHEN value > 1073741824 * 50 THEN 'critical' -- > 50GB
            ELSE 'healthy'
        END as status,
        value as value,
        'bytes' as unit,
        recorded_at
    FROM latest_metrics 
    WHERE metric_name = 'size_bytes' AND rn = 1
    
    UNION ALL
    
    SELECT 
        'active_connections' as check_name,
        CASE 
            WHEN value > 80 THEN 'warning' -- > 80% of max
            WHEN value > 95 THEN 'critical' -- > 95% of max
            ELSE 'healthy'
        END as status,
        value as value,
        'count' as unit,
        recorded_at
    FROM latest_metrics 
    WHERE metric_name = 'active_count' AND rn = 1
    
    UNION ALL
    
    SELECT 
        'cache_hit_ratio' as check_name,
        CASE 
            WHEN value < 95 THEN 'warning' -- < 95%
            WHEN value < 90 THEN 'critical' -- < 90%
            ELSE 'healthy'
        END as status,
        value as value,
        'percent' as unit,
        recorded_at
    FROM latest_metrics 
    WHERE metric_name = 'hit_ratio_percent' AND rn = 1
    
    UNION ALL
    
    SELECT 
        'slow_queries' as check_name,
        CASE 
            WHEN value > 10 THEN 'warning' -- > 10 slow queries/hour
            WHEN value > 50 THEN 'critical' -- > 50 slow queries/hour
            ELSE 'healthy'
        END as status,
        value as value,
        'count' as unit,
        recorded_at
    FROM latest_metrics 
    WHERE metric_name = 'slow_count_last_hour' AND rn = 1
    
    UNION ALL
    
    SELECT 
        'waiting_locks' as check_name,
        CASE 
            WHEN value > 5 THEN 'warning' -- > 5 waiting locks
            WHEN value > 20 THEN 'critical' -- > 20 waiting locks
            ELSE 'healthy'
        END as status,
        value as value,
        'count' as unit,
        recorded_at
    FROM latest_metrics 
    WHERE metric_name = 'waiting_count' AND rn = 1
)
SELECT 
    check_name,
    status,
    value,
    unit,
    recorded_at,
    CASE 
        WHEN status = 'healthy' THEN '✅'
        WHEN status = 'warning' THEN '⚠️'
        WHEN status = 'critical' THEN '🚨'
    END as status_icon
FROM health_checks
ORDER BY 
    CASE status 
        WHEN 'critical' THEN 1 
        WHEN 'warning' THEN 2 
        WHEN 'healthy' THEN 3 
    END,
    check_name;

-- Create database performance summary view
CREATE OR REPLACE VIEW public.database_performance_summary AS
WITH recent_metrics AS (
    SELECT 
        metric_type,
        metric_name,
        AVG(value) as avg_value,
        MAX(value) as max_value,
        MIN(value) as min_value,
        COUNT(*) as sample_count
    FROM public.db_performance_metrics
    WHERE recorded_at > NOW() - INTERVAL '24 hours'
    GROUP BY metric_type, metric_name
),
slow_queries_summary AS (
    SELECT 
        COUNT(*) as total_slow_queries,
        AVG(execution_time_ms) as avg_execution_time_ms,
        MAX(execution_time_ms) as max_execution_time_ms,
        COUNT(DISTINCT query_hash) as unique_slow_queries
    FROM public.slow_query_logs
    WHERE recorded_at > NOW() - INTERVAL '24 hours'
)
SELECT 
    'database_size' as metric_category,
    'Database Size' as metric_display_name,
    (SELECT avg_value FROM recent_metrics WHERE metric_name = 'size_bytes') as current_value,
    'bytes' as unit,
    (SELECT max_value FROM recent_metrics WHERE metric_name = 'size_bytes') as max_24h,
    (SELECT min_value FROM recent_metrics WHERE metric_name = 'size_bytes') as min_24h,
    (SELECT sample_count FROM recent_metrics WHERE metric_name = 'size_bytes') as samples_24h

UNION ALL

SELECT 
    'connections' as metric_category,
    'Active Connections' as metric_display_name,
    (SELECT avg_value FROM recent_metrics WHERE metric_name = 'active_count') as current_value,
    'count' as unit,
    (SELECT max_value FROM recent_metrics WHERE metric_name = 'active_count') as max_24h,
    (SELECT min_value FROM recent_metrics WHERE metric_name = 'active_count') as min_24h,
    (SELECT sample_count FROM recent_metrics WHERE metric_name = 'active_count') as samples_24h

UNION ALL

SELECT 
    'cache_performance' as metric_category,
    'Cache Hit Ratio' as metric_display_name,
    (SELECT avg_value FROM recent_metrics WHERE metric_name = 'hit_ratio_percent') as current_value,
    'percent' as unit,
    (SELECT max_value FROM recent_metrics WHERE metric_name = 'hit_ratio_percent') as max_24h,
    (SELECT min_value FROM recent_metrics WHERE metric_name = 'hit_ratio_percent') as min_24h,
    (SELECT sample_count FROM recent_metrics WHERE metric_name = 'hit_ratio_percent') as samples_24h

UNION ALL

SELECT 
    'slow_queries' as metric_category,
    'Slow Queries (24h)' as metric_display_name,
    (SELECT total_slow_queries FROM slow_queries_summary) as current_value,
    'count' as unit,
    (SELECT max_execution_time_ms FROM slow_queries_summary) as max_24h,
    (SELECT avg_execution_time_ms FROM slow_queries_summary) as min_24h,
    (SELECT unique_slow_queries FROM slow_queries_summary) as samples_24h;

-- Create top slow queries view
CREATE OR REPLACE VIEW public.top_slow_queries AS
SELECT 
    query_hash,
    query_text,
    COUNT(*) as execution_count,
    AVG(execution_time_ms) as avg_execution_time_ms,
    MAX(execution_time_ms) as max_execution_time_ms,
    MIN(execution_time_ms) as min_execution_time_ms,
    SUM(rows_returned) as total_rows_returned,
    MAX(recorded_at) as last_seen,
    MIN(recorded_at) as first_seen
FROM public.slow_query_logs
WHERE recorded_at > NOW() - INTERVAL '7 days'
GROUP BY query_hash, query_text
ORDER BY avg_execution_time_ms DESC, execution_count DESC
LIMIT 20;

-- Create table performance summary view
CREATE OR REPLACE VIEW public.table_performance_summary AS
WITH table_metrics AS (
    SELECT 
        tags->>'table' as table_name,
        metric_name,
        AVG(value) as avg_value,
        MAX(value) as max_value,
        COUNT(*) as sample_count
    FROM public.db_performance_metrics
    WHERE recorded_at > NOW() - INTERVAL '24 hours'
    AND metric_type IN ('table_size', 'table_rows', 'table_operations')
    GROUP BY tags->>'table', metric_name
)
SELECT 
    table_name,
    MAX(CASE WHEN metric_name = 'total_bytes' THEN avg_value END) as avg_size_bytes,
    MAX(CASE WHEN metric_name = 'live_count' THEN avg_value END) as avg_row_count,
    MAX(CASE WHEN metric_name = 'insert_count' THEN avg_value END) as avg_inserts_24h,
    MAX(CASE WHEN metric_name = 'update_count' THEN avg_value END) as avg_updates_24h,
    MAX(CASE WHEN metric_name = 'delete_count' THEN avg_value END) as avg_deletes_24h,
    MAX(sample_count) as samples_24h
FROM table_metrics
WHERE table_name IS NOT NULL
GROUP BY table_name
ORDER BY avg_size_bytes DESC;

-- Create function to get database health score
CREATE OR REPLACE FUNCTION get_database_health_score()
RETURNS JSONB AS $$
DECLARE
    health_score INTEGER := 100;
    warning_count INTEGER := 0;
    critical_count INTEGER := 0;
    total_checks INTEGER := 0;
    check_record RECORD;
    result JSONB;
BEGIN
    -- Count health check results
    FOR check_record IN
        SELECT status FROM public.database_health_status
    LOOP
        total_checks := total_checks + 1;
        
        IF check_record.status = 'warning' THEN
            warning_count := warning_count + 1;
            health_score := health_score - 10;
        ELSIF check_record.status = 'critical' THEN
            critical_count := critical_count + 1;
            health_score := health_score - 25;
        END IF;
    END LOOP;
    
    -- Ensure score doesn't go below 0
    IF health_score < 0 THEN
        health_score := 0;
    END IF;
    
    -- Build result
    result := jsonb_build_object(
        'health_score', health_score,
        'status', CASE 
            WHEN critical_count > 0 THEN 'critical'
            WHEN warning_count > 0 THEN 'warning'
            ELSE 'healthy'
        END,
        'total_checks', total_checks,
        'warning_count', warning_count,
        'critical_count', critical_count,
        'checked_at', NOW()
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to get performance recommendations
CREATE OR REPLACE FUNCTION get_performance_recommendations()
RETURNS JSONB AS $$
DECLARE
    recommendations JSONB := '[]'::JSONB;
    cache_hit_ratio NUMERIC;
    slow_query_count INTEGER;
    waiting_locks INTEGER;
    db_size_bytes BIGINT;
    temp_files_count BIGINT;
BEGIN
    -- Get current metrics
    SELECT value INTO cache_hit_ratio 
    FROM public.db_performance_metrics 
    WHERE metric_name = 'hit_ratio_percent' 
    ORDER BY recorded_at DESC LIMIT 1;
    
    SELECT value INTO slow_query_count 
    FROM public.db_performance_metrics 
    WHERE metric_name = 'slow_count_last_hour' 
    ORDER BY recorded_at DESC LIMIT 1;
    
    SELECT value INTO waiting_locks 
    FROM public.db_performance_metrics 
    WHERE metric_name = 'waiting_count' 
    ORDER BY recorded_at DESC LIMIT 1;
    
    SELECT value INTO db_size_bytes 
    FROM public.db_performance_metrics 
    WHERE metric_name = 'size_bytes' 
    ORDER BY recorded_at DESC LIMIT 1;
    
    SELECT value INTO temp_files_count 
    FROM public.db_performance_metrics 
    WHERE metric_name = 'count_total' 
    ORDER BY recorded_at DESC LIMIT 1;
    
    -- Cache hit ratio recommendations
    IF cache_hit_ratio < 95 THEN
        recommendations := recommendations || jsonb_build_object(
            'type', 'performance',
            'priority', CASE WHEN cache_hit_ratio < 90 THEN 'high' ELSE 'medium' END,
            'title', 'Low Cache Hit Ratio',
            'description', 'Database cache hit ratio is ' || cache_hit_ratio || '%. Consider increasing shared_buffers or optimizing queries.',
            'action', 'Review shared_buffers configuration and query patterns'
        );
    END IF;
    
    -- Slow query recommendations
    IF slow_query_count > 10 THEN
        recommendations := recommendations || jsonb_build_object(
            'type', 'performance',
            'priority', CASE WHEN slow_query_count > 50 THEN 'high' ELSE 'medium' END,
            'title', 'High Number of Slow Queries',
            'description', slow_query_count || ' slow queries detected in the last hour. Review query performance.',
            'action', 'Analyze slow queries and add appropriate indexes'
        );
    END IF;
    
    -- Lock contention recommendations
    IF waiting_locks > 5 THEN
        recommendations := recommendations || jsonb_build_object(
            'type', 'performance',
            'priority', CASE WHEN waiting_locks > 20 THEN 'high' ELSE 'medium' END,
            'title', 'High Lock Contention',
            'description', waiting_locks || ' queries waiting for locks. Review transaction patterns.',
            'action', 'Optimize transaction duration and isolation levels'
        );
    END IF;
    
    -- Database size recommendations
    IF db_size_bytes > 1073741824 * 10 THEN -- > 10GB
        recommendations := recommendations || jsonb_build_object(
            'type', 'maintenance',
            'priority', 'low',
            'title', 'Large Database Size',
            'description', 'Database size is ' || round(db_size_bytes / 1073741824.0, 2) || 'GB. Consider archiving old data.',
            'action', 'Implement data archiving strategy'
        );
    END IF;
    
    -- Temporary file usage recommendations
    IF temp_files_count > 1000 THEN
        recommendations := recommendations || jsonb_build_object(
            'type', 'performance',
            'priority', 'medium',
            'title', 'High Temporary File Usage',
            'description', temp_files_count || ' temporary files created. Consider increasing work_mem.',
            'action', 'Increase work_mem configuration for complex queries'
        );
    END IF;
    
    RETURN jsonb_build_object(
        'recommendations', recommendations,
        'generated_at', NOW(),
        'total_recommendations', jsonb_array_length(recommendations)
    );
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies for views
ALTER VIEW public.database_health_status SET (security_invoker = true);
ALTER VIEW public.database_performance_summary SET (security_invoker = true);
ALTER VIEW public.top_slow_queries SET (security_invoker = true);
ALTER VIEW public.table_performance_summary SET (security_invoker = true);

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_database_health_score() TO authenticated;
GRANT EXECUTE ON FUNCTION get_performance_recommendations() TO authenticated;

-- Add helpful comments
COMMENT ON VIEW public.database_health_status IS 'Real-time database health status with warning and critical alerts';
COMMENT ON VIEW public.database_performance_summary IS '24-hour database performance summary with key metrics';
COMMENT ON VIEW public.top_slow_queries IS 'Top slow queries from the last 7 days with performance statistics';
COMMENT ON VIEW public.table_performance_summary IS 'Table-level performance metrics and operation counts';
COMMENT ON FUNCTION get_database_health_score() IS 'Calculates overall database health score based on key metrics';
COMMENT ON FUNCTION get_performance_recommendations() IS 'Generates automated performance optimization recommendations';
