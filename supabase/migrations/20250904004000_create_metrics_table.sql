-- Create structured_metrics table for Edge Function logging and monitoring
-- (separate from existing metrics table to avoid conflicts)
CREATE TABLE IF NOT EXISTS public.structured_metrics (
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
CREATE INDEX IF NOT EXISTS idx_structured_metrics_type_name ON public.structured_metrics(metric_type, metric_name);
CREATE INDEX IF NOT EXISTS idx_structured_metrics_recorded_at ON public.structured_metrics(recorded_at);
CREATE INDEX IF NOT EXISTS idx_structured_metrics_tags ON public.structured_metrics USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_structured_metrics_metadata ON public.structured_metrics USING GIN(metadata);

-- Create a function to clean up old structured metrics (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_structured_metrics()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.structured_metrics 
    WHERE recorded_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;

-- Create a scheduled job to clean up old structured metrics (runs daily)
SELECT cron.schedule(
    'cleanup-old-structured-metrics',
    '0 2 * * *', -- Run at 2 AM daily
    'SELECT cleanup_old_structured_metrics();'
);

-- Grant permissions
GRANT SELECT, INSERT ON public.structured_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_structured_metrics() TO authenticated;

-- Add RLS policies
ALTER TABLE public.structured_metrics ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert structured metrics
CREATE POLICY "Allow authenticated users to insert structured metrics" ON public.structured_metrics
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Allow authenticated users to read their own metrics (if tagged with user_id)
CREATE POLICY "Allow users to read their own structured metrics" ON public.structured_metrics
    FOR SELECT TO authenticated
    USING (
        tags->>'user_id' = auth.uid()::text OR
        tags->>'function_name' IS NOT NULL -- Allow reading function metrics
    );

-- Add comments for documentation
COMMENT ON TABLE public.structured_metrics IS 'Structured metrics and logging data from Edge Functions';
COMMENT ON COLUMN public.structured_metrics.metric_type IS 'Type of metric: performance, business, counter, etc.';
COMMENT ON COLUMN public.structured_metrics.metric_name IS 'Name of the metric being measured';
COMMENT ON COLUMN public.structured_metrics.value IS 'Numeric value of the metric';
COMMENT ON COLUMN public.structured_metrics.unit IS 'Unit of measurement (ms, count, bytes, etc.)';
COMMENT ON COLUMN public.structured_metrics.tags IS 'Key-value tags for filtering and grouping';
COMMENT ON COLUMN public.structured_metrics.metadata IS 'Additional context and data';
COMMENT ON COLUMN public.structured_metrics.recorded_at IS 'When the metric was recorded';
