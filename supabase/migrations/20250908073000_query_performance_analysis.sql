-- Query performance analysis and execution plan monitoring
-- Migration: 20250908073000_query_performance_analysis.sql
-- Purpose: Advanced query performance analysis and execution plan monitoring
-- Dependencies: Requires pg_stat_statements extension and slow_query_logs table

-- Create table for query execution plans
CREATE TABLE IF NOT EXISTS public.query_execution_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    query_hash BIGINT NOT NULL,
    query_text TEXT NOT NULL,
    execution_plan JSONB NOT NULL,
    plan_cost NUMERIC,
    plan_rows BIGINT,
    actual_execution_time_ms NUMERIC,
    estimated_execution_time_ms NUMERIC,
    plan_created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_query_execution_plans_query_hash ON public.query_execution_plans(query_hash);
CREATE INDEX IF NOT EXISTS idx_query_execution_plans_plan_cost ON public.query_execution_plans(plan_cost DESC);
CREATE INDEX IF NOT EXISTS idx_query_execution_plans_created_at ON public.query_execution_plans(plan_created_at DESC);

-- Enable RLS
ALTER TABLE public.query_execution_plans ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (admin only access)
CREATE POLICY "query_execution_plans_admin_only" ON public.query_execution_plans
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Create function to analyze query performance patterns
CREATE OR REPLACE FUNCTION analyze_query_performance_patterns()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    slow_queries_count INTEGER;
    avg_execution_time NUMERIC;
    max_execution_time NUMERIC;
    most_common_slow_query TEXT;
    performance_trend TEXT;
BEGIN
    -- Get slow query statistics
    SELECT 
        COUNT(*),
        AVG(execution_time_ms),
        MAX(execution_time_ms)
    INTO slow_queries_count, avg_execution_time, max_execution_time
    FROM public.slow_query_logs
    WHERE recorded_at > NOW() - INTERVAL '24 hours';
    
    -- Get most common slow query
    SELECT query_text INTO most_common_slow_query
    FROM public.slow_query_logs
    WHERE recorded_at > NOW() - INTERVAL '24 hours'
    GROUP BY query_text
    ORDER BY COUNT(*) DESC
    LIMIT 1;
    
    -- Determine performance trend
    SELECT 
        CASE 
            WHEN COUNT(*) > (SELECT COUNT(*) FROM public.slow_query_logs WHERE recorded_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours') THEN 'worsening'
            WHEN COUNT(*) < (SELECT COUNT(*) FROM public.slow_query_logs WHERE recorded_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours') THEN 'improving'
            ELSE 'stable'
        END
    INTO performance_trend
    FROM public.slow_query_logs
    WHERE recorded_at > NOW() - INTERVAL '24 hours';
    
    result := jsonb_build_object(
        'analysis_period', '24_hours',
        'slow_queries_count', slow_queries_count,
        'avg_execution_time_ms', round(avg_execution_time, 2),
        'max_execution_time_ms', max_execution_time,
        'most_common_slow_query', most_common_slow_query,
        'performance_trend', performance_trend,
        'analyzed_at', NOW()
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to get query performance insights
CREATE OR REPLACE FUNCTION get_query_performance_insights()
RETURNS JSONB AS $$
DECLARE
    insights JSONB := '[]'::JSONB;
    query_record RECORD;
    total_queries INTEGER;
    slow_queries INTEGER;
    avg_time NUMERIC;
BEGIN
    -- Get overall statistics
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE execution_time_ms > 1000) as slow,
        AVG(execution_time_ms) as avg_time
    INTO total_queries, slow_queries, avg_time
    FROM public.slow_query_logs
    WHERE recorded_at > NOW() - INTERVAL '7 days';
    
    -- Add overall performance insight
    insights := insights || jsonb_build_object(
        'type', 'overall_performance',
        'title', 'Query Performance Overview',
        'description', 'Total queries: ' || total_queries || ', Slow queries: ' || slow_queries || ', Avg time: ' || round(avg_time, 2) || 'ms',
        'severity', CASE 
            WHEN slow_queries::NUMERIC / total_queries > 0.1 THEN 'high'
            WHEN slow_queries::NUMERIC / total_queries > 0.05 THEN 'medium'
            ELSE 'low'
        END
    );
    
    -- Find queries with high execution time variance
    FOR query_record IN
        SELECT 
            query_text,
            AVG(execution_time_ms) as avg_time,
            STDDEV(execution_time_ms) as stddev_time,
            COUNT(*) as execution_count
        FROM public.slow_query_logs
        WHERE recorded_at > NOW() - INTERVAL '7 days'
        GROUP BY query_text
        HAVING COUNT(*) > 5 AND STDDEV(execution_time_ms) > AVG(execution_time_ms) * 0.5
        ORDER BY STDDEV(execution_time_ms) DESC
        LIMIT 3
    LOOP
        insights := insights || jsonb_build_object(
            'type', 'performance_variance',
            'title', 'High Execution Time Variance',
            'description', 'Query has high variance: avg ' || round(query_record.avg_time, 2) || 'ms ± ' || round(query_record.stddev_time, 2) || 'ms',
            'severity', 'medium',
            'query_preview', left(query_record.query_text, 100) || '...'
        );
    END LOOP;
    
    -- Find frequently slow queries
    FOR query_record IN
        SELECT 
            query_text,
            COUNT(*) as slow_count,
            AVG(execution_time_ms) as avg_time
        FROM public.slow_query_logs
        WHERE recorded_at > NOW() - INTERVAL '7 days'
        GROUP BY query_text
        HAVING COUNT(*) > 10
        ORDER BY COUNT(*) DESC
        LIMIT 3
    LOOP
        insights := insights || jsonb_build_object(
            'type', 'frequent_slow_query',
            'title', 'Frequently Slow Query',
            'description', 'Query is slow ' || query_record.slow_count || ' times with avg time ' || round(query_record.avg_time, 2) || 'ms',
            'severity', 'high',
            'query_preview', left(query_record.query_text, 100) || '...'
        );
    END LOOP;
    
    RETURN jsonb_build_object(
        'insights', insights,
        'generated_at', NOW(),
        'total_insights', jsonb_array_length(insights)
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to monitor index usage efficiency
CREATE OR REPLACE FUNCTION analyze_index_efficiency()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    unused_indexes JSONB;
    inefficient_indexes JSONB;
    index_record RECORD;
BEGIN
    -- Find unused indexes
    unused_indexes := '[]'::JSONB;
    FOR index_record IN
        SELECT 
            schemaname,
            tablename,
            indexname,
            idx_scan,
            idx_tup_read,
            idx_tup_fetch
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        AND idx_scan = 0
        ORDER BY pg_relation_size(indexrelid) DESC
        LIMIT 10
    LOOP
        unused_indexes := unused_indexes || jsonb_build_object(
            'schema', index_record.schemaname,
            'table', index_record.tablename,
            'index', index_record.indexname,
            'size_bytes', pg_relation_size(index_record.indexname::regclass),
            'scans', index_record.idx_scan
        );
    END LOOP;
    
    -- Find inefficient indexes (low hit ratio)
    inefficient_indexes := '[]'::JSONB;
    FOR index_record IN
        SELECT 
            schemaname,
            tablename,
            indexname,
            idx_scan,
            idx_tup_read,
            idx_tup_fetch,
            CASE 
                WHEN idx_tup_read = 0 THEN 100
                ELSE round((idx_tup_fetch::NUMERIC / idx_tup_read) * 100, 2)
            END as hit_ratio
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        AND idx_scan > 0
        AND idx_tup_read > 0
        AND (idx_tup_fetch::NUMERIC / idx_tup_read) < 0.8
        ORDER BY hit_ratio ASC
        LIMIT 10
    LOOP
        inefficient_indexes := inefficient_indexes || jsonb_build_object(
            'schema', index_record.schemaname,
            'table', index_record.tablename,
            'index', index_record.indexname,
            'hit_ratio', index_record.hit_ratio,
            'scans', index_record.idx_scan
        );
    END LOOP;
    
    result := jsonb_build_object(
        'unused_indexes', unused_indexes,
        'inefficient_indexes', inefficient_indexes,
        'analyzed_at', NOW(),
        'total_unused', jsonb_array_length(unused_indexes),
        'total_inefficient', jsonb_array_length(inefficient_indexes)
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate query optimization suggestions
CREATE OR REPLACE FUNCTION generate_query_optimization_suggestions()
RETURNS JSONB AS $$
DECLARE
    suggestions JSONB := '[]'::JSONB;
    query_record RECORD;
    table_record RECORD;
BEGIN
    -- Analyze slow queries for missing indexes
    FOR query_record IN
        SELECT 
            query_text,
            AVG(execution_time_ms) as avg_time,
            COUNT(*) as frequency
        FROM public.slow_query_logs
        WHERE recorded_at > NOW() - INTERVAL '7 days'
        AND query_text ILIKE '%WHERE%'
        AND query_text NOT ILIKE '%CREATE%'
        AND query_text NOT ILIKE '%DROP%'
        GROUP BY query_text
        HAVING COUNT(*) > 5 AND AVG(execution_time_ms) > 2000
        ORDER BY AVG(execution_time_ms) DESC
        LIMIT 5
    LOOP
        suggestions := suggestions || jsonb_build_object(
            'type', 'missing_index',
            'priority', 'high',
            'title', 'Potential Missing Index',
            'description', 'Query with avg time ' || round(query_record.avg_time, 2) || 'ms appears ' || query_record.frequency || ' times',
            'query_preview', left(query_record.query_text, 150) || '...',
            'suggestion', 'Consider adding indexes on WHERE clause columns'
        );
    END LOOP;
    
    -- Analyze table scan patterns
    FOR table_record IN
        SELECT 
            tablename,
            seq_scan,
            seq_tup_read,
            idx_scan,
            idx_tup_fetch
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        AND seq_scan > idx_scan * 2
        AND seq_tup_read > 10000
        ORDER BY seq_tup_read DESC
        LIMIT 5
    LOOP
        suggestions := suggestions || jsonb_build_object(
            'type', 'table_scan_optimization',
            'priority', 'medium',
            'title', 'High Sequential Scan Activity',
            'description', 'Table ' || table_record.tablename || ' has ' || table_record.seq_scan || ' sequential scans',
            'suggestion', 'Consider adding indexes to reduce sequential scans'
        );
    END LOOP;
    
    RETURN jsonb_build_object(
        'suggestions', suggestions,
        'generated_at', NOW(),
        'total_suggestions', jsonb_array_length(suggestions)
    );
END;
$$ LANGUAGE plpgsql;

-- Create comprehensive performance dashboard view
CREATE OR REPLACE VIEW public.performance_dashboard AS
WITH health_score AS (
    SELECT get_database_health_score() as health_data
),
performance_summary AS (
    SELECT * FROM public.database_performance_summary
),
top_slow_queries AS (
    SELECT 
        query_hash,
        left(query_text, 100) as query_preview,
        execution_count,
        avg_execution_time_ms,
        max_execution_time_ms
    FROM public.top_slow_queries
    LIMIT 5
)
SELECT 
    'health_score' as metric_type,
    (health_data->>'health_score')::INTEGER as value,
    health_data->>'status' as status,
    health_data as details
FROM health_score

UNION ALL

SELECT 
    'performance_summary' as metric_type,
    NULL as value,
    NULL as status,
    jsonb_agg(
        jsonb_build_object(
            'category', metric_category,
            'display_name', metric_display_name,
            'current_value', current_value,
            'unit', unit,
            'max_24h', max_24h,
            'min_24h', min_24h
        )
    ) as details
FROM performance_summary

UNION ALL

SELECT 
    'top_slow_queries' as metric_type,
    NULL as value,
    NULL as status,
    jsonb_agg(
        jsonb_build_object(
            'query_hash', query_hash,
            'query_preview', query_preview,
            'execution_count', execution_count,
            'avg_time_ms', avg_execution_time_ms,
            'max_time_ms', max_execution_time_ms
        )
    ) as details
FROM top_slow_queries;

-- Grant permissions
GRANT EXECUTE ON FUNCTION analyze_query_performance_patterns() TO authenticated;
GRANT EXECUTE ON FUNCTION get_query_performance_insights() TO authenticated;
GRANT EXECUTE ON FUNCTION analyze_index_efficiency() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_query_optimization_suggestions() TO authenticated;

-- Add RLS policies for views
ALTER VIEW public.performance_dashboard SET (security_invoker = true);

-- Add helpful comments
COMMENT ON TABLE public.query_execution_plans IS 'Stores query execution plans for performance analysis';
COMMENT ON FUNCTION analyze_query_performance_patterns() IS 'Analyzes query performance patterns and trends';
COMMENT ON FUNCTION get_query_performance_insights() IS 'Generates insights about query performance issues';
COMMENT ON FUNCTION analyze_index_efficiency() IS 'Analyzes index usage efficiency and identifies unused indexes';
COMMENT ON FUNCTION generate_query_optimization_suggestions() IS 'Generates automated suggestions for query optimization';
COMMENT ON VIEW public.performance_dashboard IS 'Comprehensive performance dashboard with health score, metrics, and slow queries';
